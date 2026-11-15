"""The index of v2 runs (MEM-18): one row per LangGraph thread.

The run state belongs to LangGraph's checkpointer. What is ours lives here: the
title, the organisation, the status, the creation date, and each turn of the
conversation (brief, answer, run events), so that a reopened run replays its
scene from the archive format (CLAUDE.md, rule 2).

Two implementations of one contract: in memory (tests, no database) and
Postgres (migration 0005).
"""

from __future__ import annotations

import base64
import json
import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal, Protocol

from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool
from pydantic import BaseModel, Field

RunStatus = Literal["running", "waiting", "deciding", "done", "error"]
TITLE_LENGTH = 80


class RunTurn(BaseModel):
    brief: str
    answer: str = ""
    events: list[dict[str, Any]] = Field(default_factory=list)


class RunParent(BaseModel):
    """Where a branch comes from (MEM-23)."""

    thread_id: str
    checkpoint_id: str | None = None


class RunSpecialist(BaseModel):
    """The specialist a branch was pinned to (MEM-33), by name."""

    name: str


class RunSummary(BaseModel):
    thread_id: str
    title: str
    status: RunStatus
    created_at: datetime
    turns: int
    # The run this one was forked from (MEM-23): a branch keeps its link to the
    # trajectory it diverged from.
    parent: RunParent | None = None
    # The specialist this run was pinned to at fork time (MEM-33); None means
    # the service default.
    specialist: str | None = None


class RunDetail(RunSummary):
    history: list[RunTurn]
    # The pending human gate (MEM-20), when the run waits for a decision.
    gate: dict[str, Any] | None = None


def title_of(brief: str) -> str:
    line = " ".join(brief.split())
    return line if len(line) <= TITLE_LENGTH else f"{line[: TITLE_LENGTH - 1]}…"


def encode_cursor(created_at: datetime, thread_id: str) -> str:
    raw = json.dumps([created_at.isoformat(), thread_id]).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    """A cursor that does not decode is a client error, raised as ValueError."""
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        created, thread_id = json.loads(base64.urlsafe_b64decode(padded))
        return datetime.fromisoformat(created), str(thread_id)
    except Exception as error:
        raise ValueError("invalid cursor") from error


class ThreadIndex(Protocol):
    def start(self, thread_id: str, owner: str | None, brief: str) -> bool:
        """Open the thread if new, and mark it running.

        False when the thread exists and belongs to another owner: the chat id
        comes from the client, so a thread is never continued across owners.
        """
        ...

    def finish(self, thread_id: str, turn: RunTurn, status: RunStatus) -> None:
        """Append a finished turn and set the status."""
        ...

    def fork(
        self,
        thread_id: str,
        owner: str | None,
        parent: RunParent,
        title: str,
        specialist: str | None = None,
    ) -> bool:
        """Open a branch row: its own id, its status, where it comes from, and
        which specialist it runs (MEM-23, MEM-33).

        False when the id is taken: a branch never overwrites a run.
        """
        ...

    def page(
        self, owner: str | None, cursor: str | None, limit: int
    ) -> tuple[list[RunSummary], str | None]:
        """Newest first; the cursor of the next page, or None at the end."""
        ...

    def get(self, thread_id: str, owner: str | None) -> RunDetail | None: ...

    def branches(self, thread_id: str, owner: str | None) -> list[RunSummary]:
        """The runs forked directly from this one (MEM-22), oldest first."""
        ...

    def claim_gate(self, thread_id: str, owner: str | None) -> bool:
        """Move a waiting run to `deciding`, atomically; False if it was not waiting.

        Two decisions on one gate (a double click, two tabs) must not both
        resume the run: the second one loses here and gets a 409.
        """
        ...

    def delete(self, thread_id: str, owner: str | None) -> bool: ...


@dataclass
class _Row:
    owner: str | None
    title: str
    status: RunStatus
    created_at: datetime
    turns: list[RunTurn] = field(default_factory=list)
    parent: RunParent | None = None
    specialist: str | None = None


class InMemoryThreadIndex:
    def __init__(self) -> None:
        self._rows: dict[str, _Row] = {}
        self._lock = threading.Lock()

    def start(self, thread_id: str, owner: str | None, brief: str) -> bool:
        with self._lock:
            row = self._rows.get(thread_id)
            if row is None:
                self._rows[thread_id] = _Row(owner, title_of(brief), "running", datetime.now(UTC))
                return True
            if row.owner != owner:
                return False
            row.status = "running"
            return True

    def finish(self, thread_id: str, turn: RunTurn, status: RunStatus) -> None:
        with self._lock:
            row = self._rows.get(thread_id)
            if row is not None:
                row.turns.append(turn)
                row.status = status

    def _summary(self, thread_id: str, row: _Row) -> RunSummary:
        return RunSummary(
            thread_id=thread_id,
            title=row.title,
            status=row.status,
            created_at=row.created_at,
            turns=len(row.turns),
            parent=row.parent,
            specialist=row.specialist,
        )

    def page(
        self, owner: str | None, cursor: str | None, limit: int
    ) -> tuple[list[RunSummary], str | None]:
        with self._lock:
            mine = sorted(
                ((r.created_at, tid, r) for tid, r in self._rows.items() if r.owner == owner),
                key=lambda item: (item[0], item[1]),
                reverse=True,
            )
        if cursor is not None:
            after = decode_cursor(cursor)
            mine = [item for item in mine if (item[0], item[1]) < after]
        items = [self._summary(tid, row) for _, tid, row in mine[: limit + 1]]
        return _cut(items, limit)

    def get(self, thread_id: str, owner: str | None) -> RunDetail | None:
        with self._lock:
            row = self._rows.get(thread_id)
            if row is None or row.owner != owner:
                return None
            return RunDetail(**self._summary(thread_id, row).model_dump(), history=list(row.turns))

    def branches(self, thread_id: str, owner: str | None) -> list[RunSummary]:
        with self._lock:
            mine = sorted(
                (
                    (row.created_at, tid, row)
                    for tid, row in self._rows.items()
                    if row.owner == owner
                    and row.parent is not None
                    and row.parent.thread_id == thread_id
                ),
                key=lambda item: (item[0], item[1]),
            )
            return [self._summary(tid, row) for _, tid, row in mine]

    def claim_gate(self, thread_id: str, owner: str | None) -> bool:
        with self._lock:
            row = self._rows.get(thread_id)
            if row is None or row.owner != owner or row.status != "waiting":
                return False
            row.status = "deciding"
            return True

    def fork(
        self,
        thread_id: str,
        owner: str | None,
        parent: RunParent,
        title: str,
        specialist: str | None = None,
    ) -> bool:
        with self._lock:
            if thread_id in self._rows:
                return False
            self._rows[thread_id] = _Row(
                owner, title, "running", datetime.now(UTC), parent=parent, specialist=specialist
            )
            return True

    def delete(self, thread_id: str, owner: str | None) -> bool:
        with self._lock:
            row = self._rows.get(thread_id)
            if row is None or row.owner != owner:
                return False
            del self._rows[thread_id]
            return True


def _cut(items: list[RunSummary], limit: int) -> tuple[list[RunSummary], str | None]:
    if len(items) <= limit:
        return items, None
    last = items[limit - 1]
    return items[:limit], encode_cursor(last.created_at, last.thread_id)


class PostgresThreadIndex:
    def __init__(self, pool: ConnectionPool) -> None:
        self._pool = pool

    def start(self, thread_id: str, owner: str | None, brief: str) -> bool:
        with self._pool.connection() as conn:
            row = conn.execute(
                "INSERT INTO threads (thread_id, owner, title, status) "
                "VALUES (%s, %s, %s, 'running') "
                "ON CONFLICT (thread_id) DO UPDATE SET status = 'running' "
                "WHERE threads.owner IS NOT DISTINCT FROM EXCLUDED.owner "
                "RETURNING thread_id",
                (thread_id, owner, title_of(brief)),
            ).fetchone()
        return row is not None

    def finish(self, thread_id: str, turn: RunTurn, status: RunStatus) -> None:
        with self._pool.connection() as conn:
            conn.execute(
                "UPDATE threads SET turns = turns || %s::jsonb, status = %s WHERE thread_id = %s",
                (Jsonb([turn.model_dump()]), status, thread_id),
            )

    def page(
        self, owner: str | None, cursor: str | None, limit: int
    ) -> tuple[list[RunSummary], str | None]:
        query = (
            "SELECT thread_id, title, status, created_at, jsonb_array_length(turns), "
            "parent_thread_id, fork_checkpoint_id, specialist FROM threads "
            "WHERE owner IS NOT DISTINCT FROM %s"
        )
        params: list[Any] = [owner]
        if cursor is not None:
            created, thread_id = decode_cursor(cursor)
            query += " AND (created_at, thread_id) < (%s, %s)"
            params += [created, thread_id]
        query += " ORDER BY created_at DESC, thread_id DESC LIMIT %s"
        params.append(limit + 1)
        with self._pool.connection() as conn:
            rows = conn.execute(query, params).fetchall()
        items = [
            RunSummary(
                thread_id=r[0],
                title=r[1],
                status=r[2],
                created_at=r[3],
                turns=r[4],
                parent=_parent_of(r[5], r[6]),
                specialist=r[7],
            )
            for r in rows
        ]
        return _cut(items, limit)

    def get(self, thread_id: str, owner: str | None) -> RunDetail | None:
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT thread_id, title, status, created_at, turns, "
                "parent_thread_id, fork_checkpoint_id, specialist FROM threads "
                "WHERE thread_id = %s AND owner IS NOT DISTINCT FROM %s",
                (thread_id, owner),
            ).fetchone()
        if row is None:
            return None
        history = [RunTurn.model_validate(turn) for turn in row[4]]
        return RunDetail(
            thread_id=row[0],
            title=row[1],
            status=row[2],
            created_at=row[3],
            turns=len(history),
            history=history,
            parent=_parent_of(row[5], row[6]),
            specialist=row[7],
        )

    def branches(self, thread_id: str, owner: str | None) -> list[RunSummary]:
        with self._pool.connection() as conn:
            rows = conn.execute(
                "SELECT thread_id, title, status, created_at, jsonb_array_length(turns), "
                "parent_thread_id, fork_checkpoint_id, specialist FROM threads "
                "WHERE parent_thread_id = %s AND owner IS NOT DISTINCT FROM %s "
                "ORDER BY created_at, thread_id",
                (thread_id, owner),
            ).fetchall()
        return [
            RunSummary(
                thread_id=r[0],
                title=r[1],
                status=r[2],
                created_at=r[3],
                turns=r[4],
                parent=_parent_of(r[5], r[6]),
                specialist=r[7],
            )
            for r in rows
        ]

    def claim_gate(self, thread_id: str, owner: str | None) -> bool:
        with self._pool.connection() as conn:
            row = conn.execute(
                "UPDATE threads SET status = 'deciding' "
                "WHERE thread_id = %s AND owner IS NOT DISTINCT FROM %s AND status = 'waiting' "
                "RETURNING thread_id",
                (thread_id, owner),
            ).fetchone()
        return row is not None

    def delete(self, thread_id: str, owner: str | None) -> bool:
        with self._pool.connection() as conn:
            result = conn.execute(
                "DELETE FROM threads WHERE thread_id = %s AND owner IS NOT DISTINCT FROM %s",
                (thread_id, owner),
            )
            return result.rowcount > 0

    def fork(
        self,
        thread_id: str,
        owner: str | None,
        parent: RunParent,
        title: str,
        specialist: str | None = None,
    ) -> bool:
        with self._pool.connection() as conn:
            row = conn.execute(
                "INSERT INTO threads "
                "(thread_id, owner, title, status, "
                "parent_thread_id, fork_checkpoint_id, specialist) "
                "VALUES (%s, %s, %s, 'running', %s, %s, %s) "
                "ON CONFLICT (thread_id) DO NOTHING "
                "RETURNING thread_id",
                (thread_id, owner, title, parent.thread_id, parent.checkpoint_id, specialist),
            ).fetchone()
        return row is not None


def _parent_of(thread_id: str | None, checkpoint_id: str | None) -> RunParent | None:
    if thread_id is None:
        return None
    return RunParent(thread_id=thread_id, checkpoint_id=checkpoint_id)
