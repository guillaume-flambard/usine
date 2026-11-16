"""The runs API (MEM-18): list, open, resume, delete.

Without a database, the app keeps its checkpoints in memory and its index in
memory. With USINE_TEST_DATABASE_URL (the builder's throwaway Postgres), the
same contract runs on Postgres, and a deletion is checked in the tables.
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.checkpoints import open_checkpointer
from usine_api.contracts import SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.graph import build_graph
from usine_api.threads import InMemoryThreadIndex, RunTurn, decode_cursor

DSN = os.environ.get("USINE_TEST_DATABASE_URL", "")
OPENAPI = Path(__file__).resolve().parents[1] / "openapi.json"
IDENTITY = SpecialistIdentity(name="fake", framework="test", framework_version="0")


class FakePlanner:
    async def plan(self, brief: str) -> list[str]:
        return [brief]


class FakeSpecialist:
    identity = IDENTITY

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        return SpecialistOutput(
            answer=f"fait : {task.task}", identity=IDENTITY, tokens=1, tool_calls=0
        )


class FlakySpecialist(FakeSpecialist):
    """Fails once, like a model that times out, then answers."""

    def __init__(self) -> None:
        self.calls = 0

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        self.calls += 1
        if self.calls == 1:
            raise TimeoutError("model timed out")
        return await super().run(task)


def chat(client: TestClient, text: str, chat_id: str) -> str:
    reply = client.post(
        "/api/chat",
        json={
            "id": chat_id,
            "messages": [{"role": "user", "parts": [{"type": "text", "text": text}]}],
        },
    )
    assert reply.status_code == 200
    return reply.text


@pytest.fixture
def client() -> Any:
    app = create_app(planner=FakePlanner(), specialist=FakeSpecialist())
    with TestClient(app) as c:
        yield c


def test_list_newest_first_with_a_cursor(client: TestClient) -> None:
    for n in range(3):
        chat(client, f"brief {n}", f"chat-{n}")

    first = client.get("/api/runs", params={"limit": 2}).json()
    assert [r["title"] for r in first["items"]] == ["brief 2", "brief 1"]
    assert first["next_cursor"]
    second = client.get("/api/runs", params={"limit": 2, "cursor": first["next_cursor"]}).json()
    assert [r["title"] for r in second["items"]] == ["brief 0"]
    assert second["next_cursor"] is None
    assert first["items"][0]["status"] == "done"
    assert first["items"][0]["turns"] == 1


@pytest.mark.parametrize(
    "params", [{"limit": 0}, {"limit": 101}, {"limit": "x"}, {"cursor": "pas-un-curseur"}]
)
def test_list_rejects_bad_parameters(client: TestClient, params: dict[str, Any]) -> None:
    assert client.get("/api/runs", params=params).status_code == 422


def test_open_returns_each_turn_with_its_events(client: TestClient) -> None:
    chat(client, "relire les portes", "chat-a")
    chat(client, "et les invites", "chat-a")

    run = client.get("/api/runs/chat-a").json()
    assert run["title"] == "relire les portes"
    assert [turn["brief"] for turn in run["history"]] == ["relire les portes", "et les invites"]
    assert run["history"][1]["answer"] == "fait : et les invites"
    kinds = [event["kind"] for event in run["history"][0]["events"]]
    assert kinds[0] == "run-started" and kinds[-1] == "run-finished"


def test_open_an_unknown_run_is_404(client: TestClient) -> None:
    assert client.get("/api/runs/inconnu").status_code == 404


def test_resume_continues_a_run_cut_short() -> None:
    specialist = FlakySpecialist()
    app = create_app(planner=FakePlanner(), specialist=specialist)
    with TestClient(app) as client:
        failed = chat(client, "une tâche", "chat-r")
        assert '"finishReason": "error"' in failed
        assert client.get("/api/runs/chat-r").json()["status"] == "error"

        resumed = client.post("/api/runs/chat-r/resume")
        assert resumed.status_code == 200
        assert '"delta": "fait : une tâche"' in resumed.text
        assert client.get("/api/runs/chat-r").json()["status"] == "done"
        # Planned once: the resume ran the specialist only, from the checkpoint.
        assert specialist.calls == 2

        # Nothing left to resume now.
        assert client.post("/api/runs/chat-r/resume").status_code == 409


def test_resume_an_unknown_run_is_404(client: TestClient) -> None:
    assert client.post("/api/runs/inconnu/resume").status_code == 404


def test_delete_erases_the_checkpoints_of_the_thread(client: TestClient) -> None:
    chat(client, "à effacer", "chat-d")
    saver = client.app.state.checkpointer  # type: ignore[attr-defined]
    config = {"configurable": {"thread_id": "chat-d"}}
    assert list(saver.list(config))

    assert client.delete("/api/runs/chat-d").status_code == 204
    assert client.get("/api/runs/chat-d").status_code == 404
    assert list(saver.list(config)) == []
    assert client.delete("/api/runs/chat-d").status_code == 404


def test_a_thread_is_never_continued_across_owners() -> None:
    index = InMemoryThreadIndex()
    assert index.start("t", "org-a", "brief")
    assert not index.start("t", "org-b", "autre")
    assert index.get("t", "org-b") is None
    assert not index.delete("t", "org-b")


def test_a_run_cut_by_a_restart_is_marked_failed_at_startup() -> None:
    # A run's stream lives in the process: after a restart nothing finishes it,
    # and it used to stay "en cours" forever (16 November 2026). A run waiting
    # at the gate resumes from its checkpoint, so it is left alone.
    index = InMemoryThreadIndex()
    index.start("cut", None, "coupé")
    index.start("gate", None, "à la porte")
    index.finish("gate", RunTurn(brief="à la porte", answer="", events=[]), "waiting")

    with TestClient(create_app(planner=FakePlanner(), threads=index)):
        pass

    assert index.get("cut", None).status == "error"  # type: ignore[union-attr]
    assert index.get("gate", None).status == "waiting"  # type: ignore[union-attr]
    assert index.abandon_running() == 0


def test_the_openapi_contract_is_served_and_versioned(client: TestClient) -> None:
    served = client.get("/api/openapi.json").json()
    for path in ("/api/runs", "/api/runs/{thread_id}", "/api/runs/{thread_id}/resume"):
        assert path in served["paths"]
    body = json.dumps(served, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    if os.environ.get("USINE_REGEN_FIXTURES") == "1":
        OPENAPI.write_text(body, encoding="utf-8")
    assert body == OPENAPI.read_text(encoding="utf-8"), (
        "openapi.json is stale: USINE_REGEN_FIXTURES=1 pnpm test:api"
    )


def test_cursor_round_trips() -> None:
    from datetime import UTC, datetime

    from usine_api.threads import encode_cursor

    moment = datetime(2026, 11, 15, 0, 30, tzinfo=UTC)
    assert decode_cursor(encode_cursor(moment, "chat-1")) == (moment, "chat-1")


@pytest.mark.skipif(not DSN, reason="USINE_TEST_DATABASE_URL not set")
async def test_on_postgres_a_deletion_leaves_no_checkpoint_and_no_index_row() -> None:
    from psycopg_pool import ConnectionPool

    from usine_api.db import migrate
    from usine_api.threads import PostgresThreadIndex

    thread_id = f"pg-{uuid.uuid4().hex}"
    pool = ConnectionPool(DSN, open=True)
    try:
        migrate(pool)
        index = PostgresThreadIndex(pool)
        async with open_checkpointer(DSN) as saver:
            graph = build_graph(FakePlanner(), FakeSpecialist(), checkpointer=saver)
            assert index.start(thread_id, None, "sur postgres")
            await graph.ainvoke(
                {"brief": "sur postgres"}, {"configurable": {"thread_id": thread_id}}
            )
            index.finish(thread_id, RunTurn(brief="sur postgres", answer="ok"), "done")

            assert not index.start(thread_id, "org-x", "vol")
            # The human gate claim (MEM-20): atomic, once, owner only.
            index.finish(thread_id, RunTurn(brief="sur postgres"), "waiting")
            assert not index.claim_gate(thread_id, "org-x")
            assert index.claim_gate(thread_id, None)
            assert not index.claim_gate(thread_id, None)
            page, _ = index.page(None, None, 100)
            assert thread_id in [r.thread_id for r in page]

            await saver.adelete_thread(thread_id)
            assert index.delete(thread_id, None)

        with pool.connection() as conn:
            for table in ("checkpoints", "checkpoint_writes", "checkpoint_blobs"):
                left = conn.execute(
                    f"SELECT count(*) FROM {table} WHERE thread_id = %s", (thread_id,)
                ).fetchone()
                assert left == (0,), table
            assert conn.execute(
                "SELECT count(*) FROM threads WHERE thread_id = %s", (thread_id,)
            ).fetchone() == (0,)
    finally:
        pool.close()
