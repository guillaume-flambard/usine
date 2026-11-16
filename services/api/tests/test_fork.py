"""Forker un run depuis un checkpoint (MEM-23).

Ce que ces tests protègent : forker ne touche pas au tronçon commun, la branche
a son propre identifiant et son lien à l'origine, et la divergence repart
vraiment du point choisi (le planificateur n'est pas rappelé quand on reprend
après le superviseur).

La doc qui fait autorité, lue pour ce lot :
https://docs.langchain.com/oss/python/langgraph/use-time-travel, contre la
source installée (langgraph 1.2.22).
"""

from __future__ import annotations

import json
import os
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.checkpoints import open_checkpointer
from usine_api.contracts import SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.fork import AS_INPUT, ForkRequest, fork_run
from usine_api.graph import build_graph
from usine_api.threads import PostgresThreadIndex, RunTurn

DSN = os.environ.get("USINE_TEST_DATABASE_URL", "")
IDENTITY = SpecialistIdentity(name="fake", framework="test", framework_version="0")


class CountingPlanner:
    """One sub-task per brief: two different briefs give visibly different plans."""

    def __init__(self) -> None:
        self.calls = 0
        self.briefs: list[str] = []

    async def plan(self, brief: str) -> list[str]:
        self.calls += 1
        self.briefs.append(brief)
        return [f"{brief} / a", f"{brief} / b"]


class CountingSpecialist:
    identity = IDENTITY

    def __init__(self) -> None:
        self.calls = 0

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        self.calls += 1
        # The text ends with the sub-task; the brief, when it differs, comes first.
        subtask = task.task.rsplit("\n", 1)[-1]
        return SpecialistOutput(
            answer=f"fait : {subtask}", identity=IDENTITY, tokens=1, tool_calls=0
        )


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
def planner() -> CountingPlanner:
    return CountingPlanner()


@pytest.fixture
def specialist() -> CountingSpecialist:
    return CountingSpecialist()


@pytest.fixture
def client(planner: CountingPlanner, specialist: CountingSpecialist) -> Any:
    with TestClient(create_app(planner=planner, specialist=specialist)) as c:
        yield c


def checkpoints(client: TestClient, thread_id: str) -> list[dict[str, Any]]:
    reply = client.get(f"/api/runs/{thread_id}/checkpoints")
    assert reply.status_code == 200
    return reply.json()


def fork(client: TestClient, thread_id: str, **body: Any) -> Any:
    return client.post(f"/api/runs/{thread_id}/fork", json=body or {})


def branch_of(reply: Any) -> str:
    """The branch id, as the fork stream announces it (the first event)."""
    first = reply.text.split("\n\n", 1)[0]
    return str(json.loads(first.removeprefix("data: "))["messageMetadata"]["threadId"])


def test_the_entry_constant_matches_the_installed_library() -> None:
    # AS_INPUT is a copy of a private constant: if a version bump renames it,
    # the fork stops replanning silently. This is the tripwire.
    from langgraph._internal import _constants

    assert AS_INPUT == _constants.INPUT


def test_the_checkpoints_of_a_run_are_listed_newest_first(client: TestClient) -> None:
    chat(client, "un brief", "chat-c")

    states = checkpoints(client, "chat-c")
    assert states[0]["next"] == []  # the end: nothing left to run
    assert states[-1]["source"] == "input"
    assert any("specialist" in state["next"] for state in states)


def test_forking_after_the_supervisor_keeps_the_original_and_continues_it(
    client: TestClient, planner: CountingPlanner
) -> None:
    chat(client, "premier brief", "chat-f")
    before = checkpoints(client, "chat-f")
    chosen = next(state for state in before if "specialist" in state["next"])

    reply = fork(client, "chat-f", checkpoint_id=chosen["checkpoint_id"])
    assert reply.status_code == 200
    branch_id = branch_of(reply)

    # The branch continues from the fork point: the plan is inherited, so the
    # planner is not called again, and it answers in the fork's own stream.
    assert "fait : premier brief / a" in reply.text
    assert planner.calls == 1

    branch = client.get(f"/api/runs/{branch_id}").json()
    assert branch["thread_id"] != "chat-f"
    assert branch["parent"] == {
        "thread_id": "chat-f",
        "checkpoint_id": chosen["checkpoint_id"],
    }
    assert branch["status"] == "done"
    assert branch["turns"] == 1

    # The original is untouched: same checkpoints, same ids, same run.
    assert checkpoints(client, "chat-f") == before
    assert client.get("/api/runs/chat-f").json()["status"] == "done"
    # Its own history started at the fork point, not at the origin's step 0.
    assert len(checkpoints(client, branch_id)) < len(before)


def test_forking_at_the_entry_with_a_new_brief_replans(
    client: TestClient, planner: CountingPlanner
) -> None:
    chat(client, "premier brief", "chat-e")

    reply = fork(client, "chat-e", brief="deuxieme brief")
    assert reply.status_code == 200
    branch_id = branch_of(reply)
    assert "fait : deuxieme brief / a" in reply.text
    assert planner.briefs == ["premier brief", "deuxieme brief"]
    branch = client.get(f"/api/runs/{branch_id}").json()
    assert branch["parent"]["thread_id"] == "chat-e"
    assert branch["title"] == "deuxieme brief"
    # The original still says what it said.
    original = client.get("/api/runs/chat-e").json()
    assert "premier brief" in original["history"][0]["answer"]


def test_a_new_brief_on_a_middle_checkpoint_is_refused(client: TestClient) -> None:
    chat(client, "un brief", "chat-m")
    chosen = next(state for state in checkpoints(client, "chat-m") if "specialist" in state["next"])

    reply = fork(client, "chat-m", checkpoint_id=chosen["checkpoint_id"], brief="autre")
    assert reply.status_code == 409
    assert "checkpoint d'entrée" in reply.json()["detail"]


def test_forking_at_the_last_checkpoint_is_refused(client: TestClient) -> None:
    chat(client, "un brief", "chat-z")
    last = checkpoints(client, "chat-z")[0]

    reply = fork(client, "chat-z", checkpoint_id=last["checkpoint_id"])
    assert reply.status_code == 409
    assert "déjà terminé" in reply.json()["detail"]


def test_an_unknown_checkpoint_is_a_422(client: TestClient) -> None:
    chat(client, "un brief", "chat-x")
    reply = fork(client, "chat-x", checkpoint_id="pas-un-checkpoint")
    assert reply.status_code == 422


def test_an_unknown_run_is_a_404(client: TestClient) -> None:
    assert fork(client, "inconnu").status_code == 404
    assert client.get("/api/runs/inconnu/checkpoints").status_code == 404


def test_the_branch_is_listed_next_to_its_parent(client: TestClient) -> None:
    chat(client, "un brief", "chat-l")
    branch_id = branch_of(fork(client, "chat-l"))

    listed = client.get("/api/runs", params={"limit": 10}).json()["items"]
    found = next(item for item in listed if item["thread_id"] == branch_id)
    assert found["parent"]["thread_id"] == "chat-l"


@pytest.mark.skipif(not DSN, reason="USINE_TEST_DATABASE_URL is not set")
async def test_on_postgres_the_branch_has_its_own_checkpoint_rows(
    planner: CountingPlanner,
) -> None:
    from psycopg_pool import ConnectionPool

    from usine_api.db import migrate

    source = f"pg-{uuid.uuid4().hex}"
    pool = ConnectionPool(DSN, open=True)
    try:
        migrate(pool)
        index = PostgresThreadIndex(pool)
        async with open_checkpointer(DSN) as saver:
            graph = build_graph(planner, CountingSpecialist(), checkpointer=saver)
            assert index.start(source, None, "sur postgres")
            await graph.ainvoke({"brief": "sur postgres"}, {"configurable": {"thread_id": source}})
            index.finish(source, RunTurn(brief="sur postgres", answer="ok"), "done")

            def rows(thread: str) -> int:
                with pool.connection() as conn:
                    return int(
                        conn.execute(
                            "SELECT count(*) FROM checkpoints WHERE thread_id = %s", (thread,)
                        ).fetchone()[0]
                    )

            before = rows(source)
            branch = (
                await fork_run(graph, index, thread_id=source, owner=None, request=ForkRequest())
            ).detail

            assert branch.parent is not None
            assert branch.parent.thread_id == source
            assert rows(source) == before
            assert rows(branch.thread_id) == 1

            await graph.ainvoke(None, {"configurable": {"thread_id": branch.thread_id}})
            assert rows(branch.thread_id) > 1

            with pool.connection() as conn:
                parent = conn.execute(
                    "SELECT parent_thread_id, fork_checkpoint_id FROM threads WHERE thread_id = %s",
                    (branch.thread_id,),
                ).fetchone()
            assert parent is not None and parent[0] == source and parent[1]
    finally:
        pool.close()


async def test_seeding_a_branch_does_not_duplicate_the_specialist_results() -> None:
    """The `results` channel has a reducer; seeding must not apply it twice.

    Forking after the specialists is the case that would show it: the chosen
    checkpoint already holds two outputs, and `update_state` runs them through
    `collect_results` again on the new thread.
    """
    from langgraph.checkpoint.memory import InMemorySaver

    from usine_api.checkpoints import SERDE
    from usine_api.threads import InMemoryThreadIndex

    saver = InMemorySaver(serde=SERDE)
    graph = build_graph(CountingPlanner(), CountingSpecialist(), checkpointer=saver)
    source = "chat-reducer"
    await graph.ainvoke({"brief": "un brief"}, {"configurable": {"thread_id": source}})
    index = InMemoryThreadIndex()
    assert index.start(source, None, "un brief")

    states = [
        state async for state in graph.aget_state_history({"configurable": {"thread_id": source}})
    ]
    chosen = next(state for state in states if "synthesize" in state.next)
    after_specialists = dict(chosen.values)
    assert len(after_specialists["results"]) == 2

    forked = await fork_run(
        graph,
        index,
        thread_id=source,
        owner=None,
        request=ForkRequest(
            checkpoint_id=chosen.config["configurable"]["checkpoint_id"]  # type: ignore[index]
        ),
    )
    seeded = await graph.aget_state({"configurable": {"thread_id": forked.detail.thread_id}})
    assert len(seeded.values["results"]) == 2
    assert [output.answer for output in seeded.values["results"]] == [
        output.answer for output in after_specialists["results"]
    ]
