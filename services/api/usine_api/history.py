"""L'historique d'un run : ses checkpoints en arbre, branches comprises (MEM-22).

`get_state_history` rend les checkpoints d'un thread du plus récent au plus
ancien, chacun avec son `parent_config` et son `created_at`
(https://docs.langchain.com/oss/python/langgraph/checkpointers, vérifié contre
langgraph 1.2.22). Un fork crée un thread à part (MEM-23) : son premier
checkpoint n'a pas de parent dans son propre thread, il s'accroche donc au
checkpoint d'origine que l'index a gardé. C'est ce qui fait un arbre et non une
liste.

Le résumé ne transporte pas l'état : seulement le nom de ses clés. L'état se
lit à part, checkpoint par checkpoint et par pages (`state_page`).

`at` est le temps écoulé depuis le premier checkpoint du run demandé, jamais une
date absolue (règle 2 de l'architecture : le flux est le format d'archive).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi.encoders import jsonable_encoder
from langchain_core.runnables import RunnableConfig
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import StateSnapshot
from pydantic import BaseModel

from usine_api.fork import checkpoint_id_of, history_of, metadata_of
from usine_api.threads import RunParent, ThreadIndex

#: A tree deeper than this is refused rather than walked: a branch of a branch
#: of a branch is already more than the scene shows.
MAX_DEPTH = 8


class HistoryPoint(BaseModel):
    """One checkpoint of the tree, without its state."""

    thread_id: str
    checkpoint_id: str
    # Where it hangs: the previous checkpoint of its thread, or, for the first
    # checkpoint of a branch, the checkpoint the branch was forked from.
    parent: RunParent | None = None
    # The node whose writes produced this checkpoint: `__start__` for the first
    # loop step; None for the input and when parallel nodes wrote together.
    node: str | None = None
    source: str | None = None
    step: int | None = None
    # Seconds since the first checkpoint of the requested run.
    at: float
    next: list[str]
    keys: list[str]


class RunHistory(BaseModel):
    thread_id: str
    # Oldest first, the requested run then each branch, depth first.
    checkpoints: list[HistoryPoint]


class CheckpointState(BaseModel):
    thread_id: str
    checkpoint_id: str
    total: int
    offset: int
    values: dict[str, Any]


def _config(thread_id: str) -> RunnableConfig:
    return {"configurable": {"thread_id": thread_id}}


async def _states(
    graph: CompiledStateGraph[Any, Any, Any, Any], thread_id: str
) -> list[StateSnapshot]:
    """Oldest first."""
    newest_first = history_of([s async for s in graph.aget_state_history(_config(thread_id))])
    return list(reversed(newest_first))


def _created(snapshot: StateSnapshot) -> datetime | None:
    return datetime.fromisoformat(snapshot.created_at) if snapshot.created_at else None


def _points(
    thread_id: str,
    states: list[StateSnapshot],
    origin: datetime | None,
    fork_parent: RunParent | None,
) -> list[HistoryPoint]:
    points: list[HistoryPoint] = []
    previous: StateSnapshot | None = None
    for snapshot in states:
        parent_id = None
        if snapshot.parent_config is not None:
            parent_id = snapshot.parent_config["configurable"].get("checkpoint_id")
        parent = (
            RunParent(thread_id=thread_id, checkpoint_id=str(parent_id))
            if parent_id is not None
            else fork_parent
        )
        metadata = metadata_of(snapshot)
        # The node that produced a checkpoint is the one the previous checkpoint
        # was about to run; parallel tasks name none.
        names = sorted(set(previous.next)) if previous is not None else []
        node = names[0] if len(names) == 1 and metadata.get("source") == "loop" else None
        created = _created(snapshot)
        at = (created - origin).total_seconds() if created and origin else 0.0
        points.append(
            HistoryPoint(
                thread_id=thread_id,
                checkpoint_id=checkpoint_id_of(snapshot) or "",
                parent=parent,
                node=node,
                source=metadata.get("source"),
                step=metadata.get("step"),
                at=round(max(at, 0.0), 3),
                next=list(snapshot.next),
                keys=sorted(snapshot.values) if isinstance(snapshot.values, dict) else [],
            )
        )
        previous = snapshot
    return points


async def history_of_thread(
    graph: CompiledStateGraph[Any, Any, Any, Any],
    index: ThreadIndex,
    thread_id: str,
    owner: str | None,
) -> RunHistory:
    """The run's checkpoints and those of its branches, as one tree."""
    root_states = await _states(graph, thread_id)
    origin = _created(root_states[0]) if root_states else None
    checkpoints = _points(thread_id, root_states, origin, None)

    pending = [(branch.thread_id, branch.parent, 1) for branch in index.branches(thread_id, owner)]
    seen = {thread_id}
    while pending:
        branch_id, fork_parent, depth = pending.pop(0)
        if branch_id in seen or depth > MAX_DEPTH:
            continue
        seen.add(branch_id)
        checkpoints += _points(branch_id, await _states(graph, branch_id), origin, fork_parent)
        pending += [(b.thread_id, b.parent, depth + 1) for b in index.branches(branch_id, owner)]
    return RunHistory(thread_id=thread_id, checkpoints=checkpoints)


async def state_page(
    graph: CompiledStateGraph[Any, Any, Any, Any],
    thread_id: str,
    checkpoint_id: str,
    offset: int,
    limit: int,
) -> CheckpointState | None:
    """The state of one checkpoint of this thread, a page of its keys at a time."""
    for snapshot in await _states(graph, thread_id):
        if checkpoint_id_of(snapshot) == checkpoint_id:
            values = snapshot.values if isinstance(snapshot.values, dict) else {}
            keys = sorted(values)[offset : offset + limit]
            return CheckpointState(
                thread_id=thread_id,
                checkpoint_id=checkpoint_id,
                total=len(values),
                offset=offset,
                values=jsonable_encoder({key: values[key] for key in keys}),
            )
    return None
