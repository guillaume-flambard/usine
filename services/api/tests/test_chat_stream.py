"""`POST /api/chat`: the supervisor graph as an AI SDK UI message stream (MEM-14).

The recorded streams in `fixtures/chat-stream/` are the contract between the two
languages. This file checks that the service still writes them byte for byte;
`apps/web/src/contracts/chat-stream.test.ts` parses the same files with the
installed `ai` package, so a drift on either side fails a test.

Regenerate after an intended change: USINE_REGEN_FIXTURES=1 pnpm test:api
"""

from __future__ import annotations

import asyncio
import json
import os
from itertools import count
from pathlib import Path
from typing import Any

import httpx
import openai
import pytest
from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.chat_stream import ChatRequest, run_stream
from usine_api.contracts import RunEvent, SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.graph import build_graph

FIXTURES = Path(__file__).parent / "fixtures" / "chat-stream"
IDENTITY = SpecialistIdentity(name="fake", framework="test", framework_version="0")


class FakePlanner:
    def __init__(self, subtasks: list[str]) -> None:
        self.subtasks = subtasks

    async def plan(self, brief: str) -> list[str]:
        return self.subtasks


class FakeSpecialist:
    identity = IDENTITY

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        return SpecialistOutput(
            answer=f"fait : {task.task}", identity=IDENTITY, tokens=5, tool_calls=0
        )


class FailingSpecialist:
    identity = IDENTITY

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        response = httpx.Response(429, request=httpx.Request("POST", "http://litellm.test/v1"))
        raise openai.RateLimitError("rate limited", response=response, body=None)


class HangingSpecialist:
    """Waits forever, and records that it was cancelled."""

    identity = IDENTITY

    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.cancelled = False

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        self.started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.cancelled = True
            raise
        raise AssertionError("unreachable")


def request(text: str = "deux choses", chat_id: str | None = "chat-1") -> ChatRequest:
    return ChatRequest.model_validate(
        {
            "id": chat_id,
            "messages": [{"id": "m1", "role": "user", "parts": [{"type": "text", "text": text}]}],
            "trigger": "submit-message",
        }
    )


def deterministic() -> dict[str, Any]:
    ids = count(1)
    ticks = count(0)
    return {"new_id": lambda: f"id-{next(ids)}", "clock": lambda: next(ticks) * 0.25}


async def collect(graph: Any, req: ChatRequest) -> str:
    return "".join([part async for part in run_stream(graph, req, **deterministic())])


def chunks(body: str) -> list[Any]:
    events = [line.removeprefix("data: ") for line in body.split("\n\n") if line]
    assert events[-1] == "[DONE]"
    return [json.loads(e) for e in events[:-1]]


def check_fixture(name: str, body: str) -> None:
    path = FIXTURES / name
    if os.environ.get("USINE_REGEN_FIXTURES") == "1":
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
    assert body == path.read_text(encoding="utf-8"), f"regenerate {name}, see module docstring"


async def test_a_run_streams_in_protocol_order() -> None:
    # Graph with two parallel specialists: fan-out order between them is not
    # fixed, so the recorded run uses one sub-task.
    graph = build_graph(FakePlanner(["relire les portes"]), FakeSpecialist())
    body = await collect(graph, request("relire les portes"))
    check_fixture("ok.sse", body)

    parts = chunks(body)
    assert [p["type"] for p in parts] == [
        "start",
        *["data-run-event"] * 7,
        "text-start",
        "text-delta",
        "text-end",
        "data-run-event",
        "finish",
    ]
    assert parts[0]["messageMetadata"] == {"threadId": "chat-1"}
    assert parts[-4]["delta"] == "fait : relire les portes"
    assert parts[-1] == {"type": "finish", "finishReason": "stop"}
    events = [RunEvent.model_validate(p["data"]) for p in parts if p["type"] == "data-run-event"]
    assert [(e.kind.value, e.node) for e in events] == [
        ("run-started", None),
        ("node-started", "supervisor"),
        ("node-finished", "supervisor"),
        ("node-started", "specialist"),
        ("node-finished", "specialist"),
        ("node-started", "synthesize"),
        ("node-finished", "synthesize"),
        ("run-finished", None),
    ]
    assert events[2].data == {"taskId": "t1", "subtasks": ["relire les portes"]}
    assert events[3].data["taskId"] == events[4].data["taskId"] == "t2"
    assert events[-1].data == {"outcome": "ok"}
    assert events[4].data["specialists"] == [
        {"name": "fake", "framework": "test", "tokens": 5, "tools": []}
    ]
    # `at` is elapsed time only, never an absolute date (CLAUDE.md, rule 2).
    assert [e.at for e in events] == sorted(e.at for e in events)


async def test_a_model_error_is_a_readable_error_chunk_never_a_silent_cut() -> None:
    graph = build_graph(FakePlanner(["une tâche"]), FailingSpecialist())
    body = await collect(graph, request("une tâche"))
    check_fixture("model-error.sse", body)

    parts = chunks(body)
    error = next(p for p in parts if p["type"] == "error")
    assert error["errorText"].startswith("Le modèle est saturé")
    assert "litellm.test" not in body  # the detail goes to the log, not the page
    assert parts[-1] == {"type": "finish", "finishReason": "error"}


async def test_an_empty_message_says_so() -> None:
    graph = build_graph(FakePlanner(["x"]), FakeSpecialist())
    parts = chunks(await collect(graph, request("   ")))
    assert [p["type"] for p in parts] == ["start", "error", "finish"]


async def test_a_missing_chat_id_opens_a_new_thread() -> None:
    graph = build_graph(FakePlanner(["x"]), FakeSpecialist())
    parts = chunks(await collect(graph, request(chat_id=None)))
    assert parts[0]["messageMetadata"]["threadId"] == "id-1"


def test_the_route_speaks_the_ui_message_stream() -> None:
    app = create_app(planner=FakePlanner(["a"]), specialist=FakeSpecialist())
    with TestClient(app) as client:
        reply = client.post(
            "/api/chat",
            json={
                "id": "chat-9",
                "messages": [{"id": "m", "role": "user", "parts": [{"type": "text", "text": "a"}]}],
                "trigger": "submit-message",
                "messageId": None,
            },
        )
    assert reply.status_code == 200
    assert reply.headers["x-vercel-ai-ui-message-stream"] == "v1"
    assert reply.headers["content-type"].startswith("text/event-stream")
    parts = chunks(reply.text)
    assert parts[0]["messageMetadata"] == {"threadId": "chat-9"}
    assert "fait : a" in [p.get("delta") for p in parts]


def test_without_a_model_the_route_streams_a_readable_error() -> None:
    with TestClient(create_app()) as client:
        reply = client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "parts": [{"type": "text", "text": "a"}]}]},
        )
    assert reply.status_code == 200
    assert [p["type"] for p in chunks(reply.text)] == ["start", "error", "finish"]


async def test_cancelling_the_consumer_cancels_the_model_call() -> None:
    # What Starlette does when the client goes away: it cancels the task that
    # drains the body. The specialist call in flight must be cancelled with it.
    specialist = HangingSpecialist()
    graph = build_graph(FakePlanner(["attendre"]), specialist)

    async def drain() -> None:
        async for _ in run_stream(graph, request("attendre"), **deterministic()):
            pass

    consumer = asyncio.create_task(drain())
    await asyncio.wait_for(specialist.started.wait(), timeout=2)
    consumer.cancel()
    with pytest.raises(asyncio.CancelledError):
        await consumer
    assert specialist.cancelled


async def test_a_client_disconnect_cancels_the_run() -> None:
    # uvicorn 0.54 announces ASGI spec 2.3, so Starlette watches for
    # `http.disconnect` and cancels the response (starlette/responses.py). The
    # cancellation must reach the graph, through the real app.
    specialist = HangingSpecialist()
    app = create_app(planner=FakePlanner(["attendre"]), specialist=specialist)
    body = json.dumps(
        {"messages": [{"role": "user", "parts": [{"type": "text", "text": "attendre"}]}]}
    ).encode()
    received = False

    async def receive() -> dict[str, Any]:
        nonlocal received
        if not received:
            received = True
            return {"type": "http.request", "body": body, "more_body": False}
        await specialist.started.wait()
        return {"type": "http.disconnect"}

    async def send(message: dict[str, Any]) -> None:
        return None

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/chat",
        "raw_path": b"/api/chat",
        "query_string": b"",
        "headers": [(b"content-type", b"application/json")],
        "client": ("127.0.0.1", 1),
        "server": ("127.0.0.1", 80),
        "root_path": "",
        "state": {},
    }
    async with app.router.lifespan_context(app):
        await asyncio.wait_for(app(scope, receive, send), timeout=5)
    assert specialist.cancelled


@pytest.mark.parametrize("name", ["ok.sse", "model-error.sse"])
def test_fixtures_end_with_done(name: str) -> None:
    assert (FIXTURES / name).read_text(encoding="utf-8").endswith("data: [DONE]\n\n")


class ProposingSpecialist:
    identity = IDENTITY

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        from usine_api.contracts import ProposedAction

        action = ProposedAction(
            kind="send", target="#annonces", justification="publier", preview="v2 est sortie"
        )
        return SpecialistOutput(
            answer="fait : publier", identity=IDENTITY, tokens=1, tool_calls=0, actions=(action,)
        )


async def test_a_gate_stops_the_stream_waiting_for_a_decision() -> None:
    # Recorded for the web read model (MEM-20): the run stops on the human gate.
    from langgraph.checkpoint.memory import InMemorySaver

    graph = build_graph(
        FakePlanner(["publier"]), ProposingSpecialist(), checkpointer=InMemorySaver()
    )
    body = await collect(graph, request("publier"))
    check_fixture("gate.sse", body)

    parts = chunks(body)
    kinds = [p["data"]["kind"] for p in parts if p["type"] == "data-run-event"]
    assert kinds[-1] == "gate-opened"
    assert "run-finished" not in kinds
    assert parts[-1] == {"type": "finish", "finishReason": "other"}


class SometimesFailingSpecialist:
    """Fails on the sub-task « b » only, like one model call past its timeout."""

    identity = IDENTITY

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        if task.task.endswith("b"):
            response = httpx.Response(429, request=httpx.Request("POST", "http://litellm.test/v1"))
            raise openai.RateLimitError("rate limited", response=response, body=None)
        return SpecialistOutput(answer="fait : a", identity=IDENTITY, tokens=1, tool_calls=0)


async def test_one_failed_specialist_does_not_stop_the_others() -> None:
    # Production, 16 November 2026: one timeout on the free gateway stopped the
    # whole run, human gate included.
    graph = build_graph(FakePlanner(["a", "b"]), SometimesFailingSpecialist())
    body = await collect(graph, request("deux choses"))
    check_fixture("partial-failure.sse", body)
    parts = chunks(body)

    assert parts[-1] == {"type": "finish", "finishReason": "stop"}
    finished = [
        p["data"]
        for p in parts
        if p.get("type") == "data-run-event"
        and p["data"]["kind"] == "node-finished"
        and p["data"]["node"] == "specialist"
    ]
    failures = [s.get("failed") for e in finished for s in e["data"]["specialists"]]
    assert sorted(failures, key=str) == [
        "Le modèle est saturé pour le moment (429). Réessayez dans une minute.",
        None,
    ]
    answer = "".join(p["delta"] for p in parts if p.get("type") == "text-delta")
    assert "fait : a" in answer
    assert "1 sur 2 sous-tâches n'ont pas abouti" in answer
    assert "litellm.test" not in answer


async def test_when_every_specialist_fails_the_run_says_so() -> None:
    graph = build_graph(FakePlanner(["a", "b"]), FailingSpecialist())
    parts = chunks(await collect(graph, request("deux choses")))

    error = next(p for p in parts if p["type"] == "error")
    assert error["errorText"].startswith("Aucun spécialiste n'a abouti")
    assert parts[-1] == {"type": "finish", "finishReason": "error"}
