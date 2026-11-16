"""Le rejeu déterministe des appels au modèle (MEM-24).

Ce que ces tests protègent : un run rejoué redonne exactement le même flux sans
réseau, un appel absent de la cassette ne s'invente pas, l'hybride ne fait
partir que ce que la cassette ne sait pas, et aucune cassette ne porte de
secret.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from langgraph.checkpoint.memory import InMemorySaver

from usine_api.cassette import Cassette, CassetteTransport, digest_of
from usine_api.chat_stream import ChatRequest, run_stream
from usine_api.graph import build_graph
from usine_api.graph.planner import ChatModelPlanner
from usine_api.graph.specialist import ChatModelSpecialist
from usine_api.models import ModelSettings

SETTINGS = ModelSettings(base_url="http://litellm.test/v1", api_key="sk-test", model="lab-fast")


def plan_reply(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "c1",
            "object": "chat.completion",
            "created": 0,
            "model": "lab-fast",
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "tool_calls",
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "Plan",
                                    "arguments": json.dumps({"subtasks": ["première tâche"]}),
                                },
                            }
                        ],
                    },
                }
            ],
            "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
        },
    )


def answer_reply(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "c2",
            "object": "chat.completion",
            "created": 0,
            "model": "lab-fast",
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "stop",
                    "message": {"role": "assistant", "content": "fait"},
                }
            ],
            "usage": {"prompt_tokens": 3, "completion_tokens": 1, "total_tokens": 4},
        },
    )


def scripted(request: httpx.Request) -> httpx.Response:
    body = json.loads(request.content)
    return plan_reply(request) if body.get("tools") else answer_reply(request)


class Refusing:
    """A live transport that must not be reached."""

    def __init__(self) -> None:
        self.calls = 0

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        raise AssertionError(f"unexpected network call: {request.method} {request.url}")

    async def aclose(self) -> None:
        return None


def counter() -> Any:
    n = 0

    def next_id() -> str:
        nonlocal n
        n += 1
        return f"id-{n}"

    return next_id


def clock(start: float = 0.0) -> Any:
    now = start

    def tick() -> float:
        nonlocal now
        now += 0.5
        return now

    return tick


async def stream_once(
    cassette: Cassette, mode: str, brief: str, *, live: Any, thread_id: str = "chat-c"
) -> str:
    transport = CassetteTransport(cassette, mode, live=live)  # type: ignore[arg-type]
    client = httpx.AsyncClient(transport=transport)
    graph = build_graph(
        ChatModelPlanner(SETTINGS, http_client=client),
        ChatModelSpecialist(SETTINGS, http_client=client),
        checkpointer=InMemorySaver(),
    )
    request = ChatRequest.model_validate(
        {
            "id": thread_id,
            "messages": [{"role": "user", "parts": [{"type": "text", "text": brief}]}],
        }
    )
    text = "".join(
        [part async for part in run_stream(graph, request, new_id=counter(), clock=clock())]
    )
    await client.aclose()
    return text


async def test_a_recorded_run_replays_byte_for_byte() -> None:
    recorded = Cassette()
    live = httpx.MockTransport(scripted)
    first = await stream_once(recorded, "record", "un brief", live=live)
    assert len(recorded.entries) == 2  # the plan, then one specialist
    assert "fait" in first

    refusing = Refusing()
    replayed = await stream_once(recorded, "replay", "un brief", live=refusing)

    assert replayed == first
    assert refusing.calls == 0


async def test_replay_refuses_a_call_the_cassette_does_not_hold() -> None:
    recorded = Cassette()
    await stream_once(recorded, "record", "un brief", live=httpx.MockTransport(scripted))

    # No network, and the miss becomes a sentence a visitor can act on.
    refusing = Refusing()
    refused = await stream_once(recorded, "replay", "un autre brief", live=refusing)
    assert refusing.calls == 0
    assert "rejoue des réponses enregistrées" in refused
    assert 'finishReason": "error' in refused


async def test_hybrid_replays_the_recorded_part_then_goes_live() -> None:
    recorded = Cassette()
    full = await stream_once(recorded, "record", "un brief", live=httpx.MockTransport(scripted))
    assert len(recorded.entries) == 2

    # Only the plan was kept: everything after it has to be produced for real.
    prefix = Cassette(source="prefix", entries=recorded.entries[:1])
    transport = CassetteTransport(prefix, "hybrid", live=httpx.MockTransport(scripted))
    client = httpx.AsyncClient(transport=transport)
    graph = build_graph(
        ChatModelPlanner(SETTINGS, http_client=client),
        ChatModelSpecialist(SETTINGS, http_client=client),
        checkpointer=InMemorySaver(),
    )
    request = ChatRequest.model_validate(
        {
            "id": "chat-c",
            "messages": [{"role": "user", "parts": [{"type": "text", "text": "un brief"}]}],
        }
    )
    text = "".join(
        [part async for part in run_stream(graph, request, new_id=counter(), clock=clock())]
    )
    await client.aclose()

    # The plan came from the cassette, and only the specialists went out.
    assert transport.replayed == 1
    assert transport.live_calls == 1
    assert text == full


def test_the_key_ignores_what_changes_between_runs() -> None:
    body = {"model": "lab-fast", "messages": [], "litellm_session_id": "chat-a"}
    other = {"model": "lab-fast", "messages": [], "litellm_session_id": "chat-b"}
    assert digest_of("POST", "/v1/chat/completions", json.dumps(body).encode()) == digest_of(
        "POST", "/v1/chat/completions", json.dumps(other).encode()
    )
    assert digest_of("POST", "/v1/chat/completions", json.dumps(body).encode()) != digest_of(
        "POST", "/v1/chat/completions", json.dumps({**body, "model": "autre"}).encode()
    )


async def test_a_cassette_carries_no_secret(tmp_path: Path) -> None:
    recorded = Cassette()
    path = tmp_path / "demo.json"

    def with_auth(request: httpx.Request) -> httpx.Response:
        # The model carries the key, as in production.
        assert request.headers["authorization"].startswith("Bearer ")
        return scripted(request)

    transport = CassetteTransport(
        recorded, "record", live=httpx.MockTransport(with_auth), path=path
    )
    client = httpx.AsyncClient(transport=transport)
    graph = build_graph(
        ChatModelPlanner(SETTINGS, http_client=client),
        ChatModelSpecialist(SETTINGS, http_client=client),
        checkpointer=InMemorySaver(),
    )
    request = ChatRequest.model_validate(
        {
            "id": "chat-s",
            "messages": [{"role": "user", "parts": [{"type": "text", "text": "un brief"}]}],
        }
    )
    "".join([part async for part in run_stream(graph, request, new_id=counter(), clock=clock())])
    await client.aclose()

    written = path.read_text(encoding="utf-8")
    assert "sk-test" not in written
    assert "authorization" not in written.lower()
    assert "bearer" not in written.lower()
    assert Cassette.load(path).entries


def demo_cassette() -> Cassette:
    from usine_api.app import DEMO_CASSETTE

    return Cassette.load(DEMO_CASSETTE)


def test_the_shipped_demo_still_matches_its_prompts() -> None:
    """The demo cassette is part of the product: it must still replay.

    Its keys are content-addressed, so editing a prompt without re-recording
    the demo (services/api/scripts/record-cassette.py) breaks this test, which
    is exactly when the showcase would go silent.
    """
    cassette = demo_cassette()
    assert cassette.brief
    assert cassette.entries, "the demo cassette is empty"
    assert "sk-" not in Path("services/api/cassettes/demo.json").read_text(encoding="utf-8")


async def test_a_keyless_service_replays_the_demo(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi.testclient import TestClient

    from usine_api.app import create_app

    monkeypatch.delenv("LITELLM_BASE_URL", raising=False)
    monkeypatch.setenv("USINE_CASSETTE", "cassettes/demo.json")
    monkeypatch.setenv("USINE_CASSETTE_MODE", "replay")

    cassette = demo_cassette()
    with TestClient(create_app(key="")) as client:
        health = client.get("/health").json()
        assert health["demo"] is True
        assert health["demoBrief"] == cassette.brief
        assert health["ready"] is False

        reply = client.post(
            "/api/chat",
            json={
                "id": "chat-demo",
                "messages": [{"role": "user", "parts": [{"type": "text", "text": cassette.brief}]}],
            },
        )
        assert reply.status_code == 200
        # The recorded answer, node events included: a real graph, recorded calls.
        assert '"kind": "node-finished"' in reply.text
        assert '"finishReason": "stop"' in reply.text

        other = client.post(
            "/api/chat",
            json={
                "id": "chat-other",
                "messages": [{"role": "user", "parts": [{"type": "text", "text": "autre chose"}]}],
            },
        )
        assert "rejoue des réponses enregistrées" in other.text


def test_a_cassette_mode_that_does_not_exist_is_a_startup_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from usine_api.app import create_app

    monkeypatch.setenv("USINE_CASSETTE", "cassettes/demo.json")
    monkeypatch.setenv("USINE_CASSETTE_MODE", "rejouer")
    with pytest.raises(ValueError, match="USINE_CASSETTE_MODE"):
        create_app(key="")


def test_a_missing_cassette_is_a_startup_error(monkeypatch: pytest.MonkeyPatch) -> None:
    from usine_api.app import create_app

    monkeypatch.setenv("USINE_CASSETTE", "cassettes/absente.json")
    monkeypatch.setenv("USINE_CASSETTE_MODE", "replay")
    with pytest.raises(FileNotFoundError):
        create_app(key="")
