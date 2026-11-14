"""The LiteLLM client and its retry policy, without network (MEM-13).

A `httpx.MockTransport` stands in for LiteLLM: it counts the attempts and
answers what each test needs, so the policy is checked on real openai SDK
exceptions, not on mocks of them.
"""

from __future__ import annotations

import json
from collections.abc import Callable

import httpx
import openai
import pytest
from langchain_core.runnables.retry import ExponentialJitterParams

from usine_api.contracts import Budget, SpecialistInput
from usine_api.graph.planner import ChatModelPlanner
from usine_api.graph.specialist import ChatModelSpecialist
from usine_api.models import ModelSettings, model_settings, retry_kwargs

# `initial` is deprecated in tenacity; a zero cap is enough for no wait.
NO_WAIT = ExponentialJitterParams(max=0, jitter=0)
SETTINGS = ModelSettings(
    base_url="http://litellm.test/v1",
    api_key="sk-test",
    model="lab-agent",
    max_attempts=3,
    backoff=NO_WAIT,
)


def plan_response(subtasks: list[str]) -> httpx.Response:
    """A chat completion whose only content is a `Plan` tool call."""
    return httpx.Response(
        200,
        json={
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "created": 0,
            "model": "lab-agent",
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
                                    "arguments": json.dumps({"subtasks": subtasks}),
                                },
                            }
                        ],
                    },
                }
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        },
    )


class Gateway:
    """A fake LiteLLM: replies come from a script, one per attempt."""

    def __init__(self, *replies: Callable[[httpx.Request], httpx.Response]) -> None:
        self.replies = list(replies)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        reply = self.replies[min(len(self.requests), len(self.replies)) - 1]
        return reply(request)

    def planner(self) -> ChatModelPlanner:
        client = httpx.AsyncClient(transport=httpx.MockTransport(self))
        return ChatModelPlanner(SETTINGS, http_client=client)


def status(code: int) -> Callable[[httpx.Request], httpx.Response]:
    return lambda _request: httpx.Response(code, json={"error": {"message": f"status {code}"}})


def ok(subtasks: list[str]) -> Callable[[httpx.Request], httpx.Response]:
    return lambda _request: plan_response(subtasks)


def timeout(request: httpx.Request) -> httpx.Response:
    raise httpx.ReadTimeout("slow gateway", request=request)


async def test_plan_is_read_from_the_tool_call() -> None:
    gateway = Gateway(ok(["chercher", "rédiger"]))

    assert await gateway.planner().plan("un brief") == ["chercher", "rédiger"]

    body = json.loads(gateway.requests[0].content)
    assert body["model"] == "lab-agent"
    assert [tool["function"]["name"] for tool in body["tools"]] == ["Plan"]
    assert body["messages"][0]["role"] == "system"
    assert body["messages"][1] == {"role": "user", "content": "un brief"}
    assert gateway.requests[0].headers["authorization"] == "Bearer sk-test"
    # Reasoning off by default (MEM-13): a reasoning model returns empty content.
    assert body["enable_thinking"] is False


async def test_empty_extras_send_no_extra_parameter() -> None:
    gateway = Gateway(ok(["une seule"]))
    settings = ModelSettings(**{**SETTINGS.__dict__, "extras": {}})
    client = httpx.AsyncClient(transport=httpx.MockTransport(gateway))

    await ChatModelPlanner(settings, http_client=client).plan("un brief")

    assert "enable_thinking" not in json.loads(gateway.requests[0].content)


def text_response(content: str) -> httpx.Response:
    """A chat completion with plain text and no tool call."""
    return httpx.Response(
        200,
        json={
            "id": "chatcmpl-text",
            "object": "chat.completion",
            "created": 0,
            "model": "lab-fast",
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "stop",
                    "message": {"role": "assistant", "content": content},
                }
            ],
            "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
        },
    )


async def test_a_plain_text_answer_is_an_empty_plan() -> None:
    # Measured on lab-fast with "Bonjour": no tool call, so no plan; the
    # supervisor then falls back to the brief instead of crashing.
    gateway = Gateway(lambda _request: text_response("Bonjour !"))

    assert await gateway.planner().plan("Bonjour") == []
    assert len(gateway.requests) == 1


@pytest.mark.parametrize("code", [400, 401, 404, 408, 409, 422])
async def test_a_4xx_is_attempted_once(code: int) -> None:
    # 408 and 409 included: the openai SDK would retry them on its own.
    gateway = Gateway(status(code))

    with pytest.raises(openai.APIStatusError):
        await gateway.planner().plan("un brief")

    assert len(gateway.requests) == 1


async def test_a_rate_limit_is_retried_then_succeeds() -> None:
    gateway = Gateway(status(429), ok(["une seule"]))

    assert await gateway.planner().plan("un brief") == ["une seule"]
    assert len(gateway.requests) == 2


async def test_a_timeout_is_retried() -> None:
    gateway = Gateway(timeout, ok(["une seule"]))

    assert await gateway.planner().plan("un brief") == ["une seule"]
    assert len(gateway.requests) == 2


async def test_repeated_server_errors_stop_after_the_last_attempt() -> None:
    gateway = Gateway(status(500), status(502), status(503))

    with pytest.raises(openai.InternalServerError):
        await gateway.planner().plan("un brief")

    assert len(gateway.requests) == SETTINGS.max_attempts


def test_the_default_wait_is_bounded() -> None:
    settings = ModelSettings(base_url="http://x/v1", api_key="k", model="m")
    params = retry_kwargs(settings)["exponential_jitter_params"]

    assert params["max"] == 8
    assert retry_kwargs(settings)["stop_after_attempt"] == 3


def test_settings_come_from_the_environment() -> None:
    settings = model_settings(
        {
            "LITELLM_BASE_URL": "http://litellm:4000/v1/",
            "LITELLM_API_KEY": "sk-usine",
            "USINE_MODEL": "lab-agent",
            "USINE_MODEL_EXTRAS": "{}",
        }
    )

    assert settings == ModelSettings(
        base_url="http://litellm:4000/v1", api_key="sk-usine", model="lab-agent", extras={}
    )


def test_defaults_are_the_lab_fast_route_without_reasoning() -> None:
    settings = model_settings({"LITELLM_BASE_URL": "http://litellm:4000/v1", "USINE_MODEL": ""})

    assert settings is not None
    assert settings.model == "lab-fast"
    assert settings.extras == {"enable_thinking": False}


@pytest.mark.parametrize("raw", ["not json", "[]", "false"])
def test_broken_extras_fail_at_startup(raw: str) -> None:
    with pytest.raises(ValueError):
        model_settings({"LITELLM_BASE_URL": "http://x/v1", "USINE_MODEL_EXTRAS": raw})


def test_no_gateway_means_no_settings() -> None:
    assert model_settings({}) is None


async def test_the_specialist_answers_within_its_budget() -> None:
    gateway = Gateway(lambda _request: text_response("Réponse du spécialiste."))
    client = httpx.AsyncClient(transport=httpx.MockTransport(gateway))
    specialist = ChatModelSpecialist(SETTINGS, http_client=client)

    output = await specialist.run(
        SpecialistInput(
            task="une sous-tâche", budget=Budget(max_tokens=300, max_seconds=30, max_tool_calls=0)
        )
    )

    assert output.answer == "Réponse du spécialiste."
    assert output.tokens == 5
    assert output.identity.framework == "langchain"
    body = json.loads(gateway.requests[0].content)
    # langchain-openai sends the cap under its current OpenAI name.
    assert body["max_completion_tokens"] == 300
    assert body["messages"][1] == {"role": "user", "content": "une sous-tâche"}
