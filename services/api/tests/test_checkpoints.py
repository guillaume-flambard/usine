"""Le checkpointer de l'API (MEM-12).

Sans base, il est en mémoire. Avec une base (USINE_TEST_DATABASE_URL), un run
interrompu se reprend après une réouverture complète du checkpointer, ce qui
est ce qu'un redémarrage de l'API produit.
"""

from __future__ import annotations

import operator
import os
import uuid
from typing import Annotated, TypedDict

import pytest
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

from usine_api.checkpoints import open_checkpointer

DSN = os.environ.get("USINE_TEST_DATABASE_URL", "")


class State(TypedDict):
    steps: Annotated[list[str], operator.add]


def build(saver):  # type: ignore[no-untyped-def]
    graph = StateGraph(State)
    graph.add_node("plan", lambda s: {"steps": ["plan"]})
    graph.add_node("review", lambda s: {"steps": ["review"]})
    graph.add_edge(START, "plan")
    graph.add_edge("plan", "review")
    graph.add_edge("review", END)
    return graph.compile(checkpointer=saver, interrupt_before=["review"])


async def test_without_database_the_saver_is_in_memory():
    async with open_checkpointer("") as saver:
        assert isinstance(saver, InMemorySaver)


def test_the_app_opens_a_checkpointer_for_its_lifetime():
    from fastapi.testclient import TestClient

    from usine_api.app import create_app

    with TestClient(create_app(key="", call=None)) as client:
        assert isinstance(client.app.state.checkpointer, InMemorySaver)


@pytest.mark.skipif(not DSN, reason="USINE_TEST_DATABASE_URL non défini")
async def test_interrupted_run_resumes_after_reopening():
    config = {"configurable": {"thread_id": f"test-{uuid.uuid4()}"}}

    async with open_checkpointer(DSN) as saver:
        app = build(saver)
        await app.ainvoke({"steps": []}, config)
        assert (await app.aget_state(config)).next == ("review",)

    # Nouveau pool, nouveau saver : seul Postgres a gardé l'état.
    async with open_checkpointer(DSN) as saver:
        app = build(saver)
        result = await app.ainvoke(None, config)
        assert result["steps"] == ["plan", "review"]
        history = [snapshot async for snapshot in app.aget_state_history(config)]
        assert len(history) == 4


@pytest.mark.skipif(not DSN, reason="USINE_TEST_DATABASE_URL non défini")
async def test_setup_is_idempotent():
    async with open_checkpointer(DSN):
        pass
    async with open_checkpointer(DSN):
        pass
