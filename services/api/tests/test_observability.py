"""Langfuse traces and prompts (MEM-16): tracing never breaks a run."""

from __future__ import annotations

import json
import logging

import httpx
import pytest

from usine_api import observability
from usine_api.chat_stream import ChatRequest, run_stream
from usine_api.graph import build_graph
from usine_api.graph.planner import ChatModelPlanner
from usine_api.graph.prompts import SUPERVISOR_PLAN, default_prompt
from usine_api.graph.specialist import ChatModelSpecialist
from usine_api.models import ModelSettings
from usine_api.observability import Prompts, chat_template, run_config

# A port nothing listens on: Langfuse is configured but unreachable.
UNREACHABLE = "http://127.0.0.1:9"


@pytest.fixture
def langfuse_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")
    monkeypatch.setenv("LANGFUSE_BASE_URL", UNREACHABLE)
    monkeypatch.setattr(observability, "_warned", set())


def test_without_keys_nothing_is_traced() -> None:
    assert run_config("thread-1") == {"configurable": {"thread_id": "thread-1"}}
    text, linked = Prompts().get(SUPERVISOR_PLAN)
    assert (text, linked) == (default_prompt(SUPERVISOR_PLAN), None)


def test_a_run_is_one_session_and_one_pseudonymous_user(langfuse_env: None) -> None:
    config = run_config("thread-1", user_id="acc_42")
    assert config["configurable"] == {"thread_id": "thread-1"}
    assert len(config["callbacks"]) == 1
    assert config["metadata"]["langfuse_session_id"] == "thread-1"
    assert config["metadata"]["langfuse_user_id"] == "acc_42"
    assert config["metadata"]["langfuse_trace_name"] == "usine/chat"


def test_a_prompt_is_literal_and_carries_its_langfuse_version() -> None:
    linked = object()
    template = chat_template('Réponds en JSON : {"a": 1}', linked)
    messages = template.format_messages(input="un brief")
    assert messages[0].content == 'Réponds en JSON : {"a": 1}'
    assert messages[1].content == "un brief"
    assert template.metadata == {"langfuse_prompt": linked}


def plan_reply(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "c",
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
                                    "arguments": json.dumps({"subtasks": ["une tâche"]}),
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
            "id": "c",
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


async def test_langfuse_unreachable_gives_a_successful_run_and_one_warning(
    langfuse_env: None, caplog: pytest.LogCaptureFixture
) -> None:
    def gateway(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        return plan_reply(request) if body.get("tools") else answer_reply(request)

    settings = ModelSettings(base_url="http://litellm.test/v1", api_key="sk-test", model="lab-fast")
    client = httpx.AsyncClient(transport=httpx.MockTransport(gateway))
    graph = build_graph(
        ChatModelPlanner(settings, http_client=client),
        ChatModelSpecialist(settings, http_client=client),
    )
    request = ChatRequest.model_validate(
        {"messages": [{"role": "user", "parts": [{"type": "text", "text": "un brief"}]}]}
    )

    caplog.set_level(logging.WARNING, logger="usine.observability")
    for _ in range(2):
        body = "".join([part async for part in run_stream(graph, request)])
        assert '"finishReason": "stop"' in body
        assert '"delta": "fait"' in body

    warnings = [r for r in caplog.records if r.name == "usine.observability"]
    # One per prompt name, and only once across both runs.
    assert len(warnings) == 2
    assert all("default used" in r.getMessage() for r in warnings)


async def test_every_model_call_carries_the_run_session_to_litellm() -> None:
    # LiteLLM turns `litellm_session_id` into the Langfuse session: its traces,
    # cost included, then sit in the same session as the usine's run.
    bodies: list[dict[str, object]] = []

    def gateway(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        bodies.append(body)
        return plan_reply(request) if body.get("tools") else answer_reply(request)

    settings = ModelSettings(base_url="http://litellm.test/v1", api_key="sk-test", model="lab-fast")
    client = httpx.AsyncClient(transport=httpx.MockTransport(gateway))
    planner = ChatModelPlanner(settings, http_client=client)
    graph = build_graph(planner, ChatModelSpecialist(settings, http_client=client))
    request = ChatRequest.model_validate(
        {"id": "chat-42", "messages": [{"role": "user", "parts": [{"type": "text", "text": "x"}]}]}
    )
    "".join([part async for part in run_stream(graph, request)])

    assert len(bodies) == 2
    assert {body["litellm_session_id"] for body in bodies} == {"chat-42"}
    assert all(body["enable_thinking"] is False for body in bodies)

    # Outside a graph run there is no session to carry.
    bodies.clear()
    await planner.plan("hors run")
    assert "litellm_session_id" not in bodies[0]
