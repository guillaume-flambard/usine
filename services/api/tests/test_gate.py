"""The human gate (MEM-20): interrupt() before any irreversible action.

Graph level: approve, reject, edit, and a gate that survives a restart of the
checkpointer (on Postgres, with USINE_TEST_DATABASE_URL). API level: the run
waits, says so, takes a decision once, and an expired gate is a rejection.
"""

from __future__ import annotations

import os
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from pydantic import ValidationError

from usine_api.app import create_app
from usine_api.checkpoints import open_checkpointer
from usine_api.contracts import (
    ROLLBACK_NOTICE,
    GateDecision,
    ProposedAction,
    SpecialistIdentity,
    SpecialistInput,
    SpecialistOutput,
)
from usine_api.contracts import action as action_contract
from usine_api.graph import build_graph

DSN = os.environ.get("USINE_TEST_DATABASE_URL", "")
IDENTITY = SpecialistIdentity(name="fake", framework="test", framework_version="0")
SEND = ProposedAction(
    kind="send", target="#annonces", justification="annoncer la release", preview="v2 est sortie"
)


class Planner:
    async def plan(self, brief: str) -> list[str]:
        return [brief]


class ProposingSpecialist:
    """Answers, and proposes one irreversible action."""

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        return SpecialistOutput(
            answer=f"fait : {task.task}", identity=IDENTITY, tokens=1, tool_calls=0, actions=(SEND,)
        )


class SpyExecutor:
    def __init__(self) -> None:
        self.executed: list[ProposedAction] = []

    async def execute(self, action: ProposedAction) -> str:
        self.executed.append(action)
        return "envoyé"


async def interrupted(saver: Any, executor: SpyExecutor, thread: str) -> Any:
    graph = build_graph(Planner(), ProposingSpecialist(), checkpointer=saver, executor=executor)
    config = {"configurable": {"thread_id": thread}}
    await graph.ainvoke({"brief": "publier la release"}, config)
    return graph, config


async def test_the_run_stops_on_the_gate_before_acting() -> None:
    spy = SpyExecutor()
    graph, config = await interrupted(InMemorySaver(), spy, "g-1")
    state = await graph.aget_state(config)
    assert state.next == ("human_gate",)
    request = state.interrupts[0].value
    assert request["actions"][0]["target"] == "#annonces"
    assert request["notice"] == ROLLBACK_NOTICE
    assert spy.executed == []


async def test_approve_executes_the_proposed_action() -> None:
    spy = SpyExecutor()
    graph, config = await interrupted(InMemorySaver(), spy, "g-2")
    final = await graph.ainvoke(Command(resume={"decision": "approve"}), config)
    assert spy.executed == [SEND]
    assert final["executed"] == [{"kind": "send", "target": "#annonces", "outcome": "envoyé"}]


async def test_a_rejection_never_executes_the_action() -> None:
    spy = SpyExecutor()
    graph, config = await interrupted(InMemorySaver(), spy, "g-3")
    final = await graph.ainvoke(
        Command(resume={"decision": "reject", "reason": "pas avant la recette"}), config
    )
    assert spy.executed == []
    assert final["decision"]["reason"] == "pas avant la recette"
    assert final["executed"] == []


async def test_an_edit_executes_the_edited_action_only() -> None:
    spy = SpyExecutor()
    graph, config = await interrupted(InMemorySaver(), spy, "g-4")
    edited = SEND.model_copy(update={"preview": "la v2 arrive lundi"})
    await graph.ainvoke(
        Command(resume={"decision": "edit", "actions": [edited.model_dump()]}), config
    )
    assert spy.executed == [edited]


@pytest.mark.parametrize(
    "raw",
    [
        {"decision": "reject"},
        {"decision": "reject", "reason": "  "},
        {"decision": "edit"},
        {"decision": "approve", "actions": [SEND.model_dump()]},
        {"decision": "maybe"},
    ],
)
def test_an_incomplete_decision_is_refused(raw: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        GateDecision.model_validate(raw)


@pytest.mark.skipif(not DSN, reason="USINE_TEST_DATABASE_URL not set")
async def test_on_postgres_the_gate_survives_a_restart() -> None:
    thread = f"gate-{uuid.uuid4().hex}"
    async with open_checkpointer(DSN) as saver:
        await interrupted(saver, SpyExecutor(), thread)

    # A new saver and a new graph: what an API restart produces.
    spy = SpyExecutor()
    async with open_checkpointer(DSN) as saver:
        graph = build_graph(Planner(), ProposingSpecialist(), checkpointer=saver, executor=spy)
        config = {"configurable": {"thread_id": thread}}
        state = await graph.aget_state(config)
        assert state.interrupts, "the gate must still be pending after the restart"
        await graph.ainvoke(Command(resume={"decision": "approve"}), config)
        assert spy.executed == [SEND]
        await saver.adelete_thread(thread)


def chat(client: TestClient, chat_id: str) -> str:
    reply = client.post(
        "/api/chat",
        json={
            "id": chat_id,
            "messages": [{"role": "user", "parts": [{"type": "text", "text": "publier"}]}],
        },
    )
    assert reply.status_code == 200
    return reply.text


@pytest.fixture
def client() -> Any:
    with TestClient(create_app(planner=Planner(), specialist=ProposingSpecialist())) as c:
        yield c


def test_the_api_shows_the_waiting_gate_and_takes_one_decision(client: TestClient) -> None:
    body = chat(client, "run-gate")
    assert '"kind": "gate-opened"' in body
    assert '"finishReason": "other"' in body
    assert '"kind": "run-finished"' not in body

    run = client.get("/api/runs/run-gate").json()
    assert run["status"] == "waiting"
    assert run["gate"]["actions"][0]["kind"] == "send"
    assert run["gate"]["notice"] == ROLLBACK_NOTICE

    assert client.post("/api/runs/run-gate/resume").status_code == 409
    assert client.post("/api/runs/run-gate/gate", json={"decision": "reject"}).status_code == 422

    decided = client.post("/api/runs/run-gate/gate", json={"decision": "approve"})
    assert decided.status_code == 200
    assert '"kind": "gate-decided"' in decided.text
    assert '"node": "act"' in decided.text
    # The default executor says it did nothing rather than pretend.
    assert "non exécutée" in decided.text
    assert '"outcome": "ok"' in decided.text

    run = client.get("/api/runs/run-gate").json()
    assert run["status"] == "done" and run["gate"] is None
    assert client.post("/api/runs/run-gate/gate", json={"decision": "approve"}).status_code == 409


def test_a_rejection_through_the_api_skips_the_action(client: TestClient) -> None:
    chat(client, "run-reject")
    decided = client.post(
        "/api/runs/run-reject/gate", json={"decision": "reject", "reason": "pas maintenant"}
    ).text
    assert '"decision": "reject"' in decided
    assert '"node": "act"' not in decided


def test_an_expired_gate_counts_as_a_rejection(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    chat(client, "run-late")
    monkeypatch.setattr(action_contract, "GATE_TIMEOUT_SECONDS", -1)
    decided = client.post("/api/runs/run-late/gate", json={"decision": "approve"}).text
    assert '"decision": "reject"' in decided
    assert "Délai dépassé" in decided
    assert '"node": "act"' not in decided


def test_gate_on_an_unknown_run_is_404(client: TestClient) -> None:
    assert client.post("/api/runs/nope/gate", json={"decision": "approve"}).status_code == 404
