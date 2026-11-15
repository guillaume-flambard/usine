"""L'historique d'un run : ses checkpoints en arbre, branches comprises (MEM-22).

Ce que ces tests protègent : chaque checkpoint connaît son parent, ce qui forme
un arbre et pas une liste ; une branche s'y accroche au checkpoint d'où elle a
été forkée ; le résumé ne transporte pas l'état, qui se lit à part et par pages.

Doc lue pour ce lot : https://docs.langchain.com/oss/python/langgraph/checkpointers
(`get_state_history`, `parent_config`, `created_at`), contre la source
installée (langgraph 1.2.22).
"""

from __future__ import annotations

import operator
import os
import uuid
from typing import Annotated, Any, TypedDict

import pytest
from fastapi.testclient import TestClient
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from test_fork import CountingPlanner, CountingSpecialist, branch_of, chat, checkpoints, fork

from usine_api.app import create_app
from usine_api.history import history_of_thread
from usine_api.threads import InMemoryThreadIndex


class Steps(TypedDict):
    steps: Annotated[list[str], operator.add]


def three_nodes() -> Any:
    graph = StateGraph(Steps)
    for name in ("plan", "act", "review"):
        graph.add_node(name, lambda s, name=name: {"steps": [name]})
    graph.add_edge(START, "plan")
    graph.add_edge("plan", "act")
    graph.add_edge("act", "review")
    graph.add_edge("review", END)
    return graph.compile(checkpointer=InMemorySaver())


async def test_a_five_step_run_gives_five_checkpoints_in_order_with_their_parents() -> None:
    graph = three_nodes()
    index = InMemoryThreadIndex()
    index.start("run-5", None, "trois nœuds")
    await graph.ainvoke({"steps": []}, {"configurable": {"thread_id": "run-5"}})

    history = await history_of_thread(graph, index, "run-5", None)

    points = history.checkpoints
    assert len(points) == 5
    assert [p.step for p in points] == [-1, 0, 1, 2, 3]
    assert [p.node for p in points] == [None, "__start__", "plan", "act", "review"]
    assert points[0].parent is None
    for previous, current in zip(points, points[1:], strict=False):
        assert current.parent is not None
        assert current.parent.thread_id == "run-5"
        assert current.parent.checkpoint_id == previous.checkpoint_id
    # Elapsed time only, never an absolute date, and it never goes backwards.
    assert points[0].at == 0
    assert all(b.at >= a.at for a, b in zip(points, points[1:], strict=False))
    # The summary names the state, it does not carry it.
    assert points[-1].keys == ["steps"]
    assert "values" not in points[-1].model_dump()


def client_with_a_fork() -> tuple[TestClient, str, str]:
    client = TestClient(create_app(planner=CountingPlanner(), specialist=CountingSpecialist()))
    client.__enter__()
    chat(client, "premier brief", "chat-h")
    chosen = next(s for s in checkpoints(client, "chat-h") if "specialist" in s["next"])
    reply = fork(client, "chat-h", checkpoint_id=chosen["checkpoint_id"])
    assert reply.status_code == 200
    return client, branch_of(reply), chosen["checkpoint_id"]


def test_after_a_fork_the_tree_has_two_branches() -> None:
    client, branch, fork_point = client_with_a_fork()
    try:
        reply = client.get("/api/runs/chat-h/history")
        assert reply.status_code == 200
        points = reply.json()["checkpoints"]

        threads = {p["thread_id"] for p in points}
        assert threads == {"chat-h", branch}
        # The branch's first checkpoint hangs on the origin's fork point.
        roots_of_branch = [
            p for p in points if p["thread_id"] == branch and p["parent"]["thread_id"] == "chat-h"
        ]
        assert [p["parent"]["checkpoint_id"] for p in roots_of_branch] == [fork_point]
        # Two children under the fork point: the origin's next one, and the branch.
        children = [p for p in points if (p["parent"] or {}).get("checkpoint_id") == fork_point]
        assert {p["thread_id"] for p in children} == {"chat-h", branch}
    finally:
        client.__exit__(None, None, None)


def test_the_history_of_an_unknown_run_is_a_404() -> None:
    with TestClient(create_app(planner=CountingPlanner(), specialist=CountingSpecialist())) as c:
        assert c.get("/api/runs/nope/history").status_code == 404


def test_the_state_of_a_checkpoint_is_read_apart_and_by_pages() -> None:
    with TestClient(create_app(planner=CountingPlanner(), specialist=CountingSpecialist())) as c:
        chat(c, "un brief", "chat-d")
        last = c.get("/api/runs/chat-d/history").json()["checkpoints"][-1]
        url = f"/api/runs/chat-d/checkpoints/{last['checkpoint_id']}"

        first = c.get(url, params={"limit": 2}).json()
        assert first["total"] == len(last["keys"])
        assert list(first["values"]) == sorted(last["keys"])[:2]
        assert first["values"]["brief"] == "un brief"

        rest = c.get(url, params={"offset": 2, "limit": 50}).json()
        assert set(first["values"]) | set(rest["values"]) == set(last["keys"])

        assert c.get("/api/runs/chat-d/checkpoints/inconnu").status_code == 404


DSN = os.environ.get("USINE_TEST_DATABASE_URL", "")


@pytest.mark.skipif(not DSN, reason="USINE_TEST_DATABASE_URL is not set")
async def test_on_postgres_the_tree_holds_the_branch() -> None:
    from psycopg_pool import ConnectionPool

    from usine_api.checkpoints import open_checkpointer
    from usine_api.db import migrate
    from usine_api.fork import ForkRequest, fork_run
    from usine_api.graph import build_graph
    from usine_api.threads import PostgresThreadIndex

    source = f"pg-h-{uuid.uuid4().hex}"
    pool = ConnectionPool(DSN, open=True)
    try:
        migrate(pool)
        index = PostgresThreadIndex(pool)
        async with open_checkpointer(DSN) as saver:
            graph = build_graph(CountingPlanner(), CountingSpecialist(), checkpointer=saver)
            assert index.start(source, None, "arbre")
            await graph.ainvoke({"brief": "arbre"}, {"configurable": {"thread_id": source}})
            branch = (
                await fork_run(graph, index, thread_id=source, owner=None, request=ForkRequest())
            ).detail

            assert [b.thread_id for b in index.branches(source, None)] == [branch.thread_id]
            assert index.branches(source, "another-org") == []
            history = await history_of_thread(graph, index, source, None)
            assert {p.thread_id for p in history.checkpoints} == {source, branch.thread_id}
    finally:
        pool.close()
