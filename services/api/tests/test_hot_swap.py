"""Le remplacement à chaud : changer de spécialiste sur une branche (MEM-33).

Ce que ces tests protègent : le même run, forké, tourne avec une autre
implémentation ; la branche s'en souvient quand on la rouvre ; un nom que le
service ne sait pas faire tourner est refusé **avant** que quoi que ce soit
naisse, plutôt que de laisser une branche à moitié vivante.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient
from langgraph.checkpoint.memory import InMemorySaver

from usine_api.app import create_app
from usine_api.chat_stream import ChatRequest, run_stream
from usine_api.contracts import SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.graph import build_graph

IDENTITY_A = SpecialistIdentity(name="fake:langchain", framework="langchain", framework_version="1")
IDENTITY_B = SpecialistIdentity(name="fake:other", framework="other", framework_version="2")


class _Planner:
    async def plan(self, brief: str) -> list[str]:
        return [brief]


class _Specialist:
    def __init__(self, identity: SpecialistIdentity) -> None:
        self.identity = identity
        self.calls = 0

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        self.calls += 1
        return SpecialistOutput(
            answer=f"{self.identity.framework} a répondu : {task.task}",
            identity=self.identity,
            tokens=2,
            tool_calls=0,
        )


@pytest.fixture
def pair() -> tuple[_Specialist, _Specialist]:
    return _Specialist(IDENTITY_A), _Specialist(IDENTITY_B)


@pytest.fixture
def client(pair: tuple[_Specialist, _Specialist]) -> Any:
    first, second = pair
    app = create_app(
        planner=_Planner(),
        specialist=first,
        specialists={"other": second},
    )
    with TestClient(app) as c:
        yield c


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


def fork(client: TestClient, thread_id: str, **body: Any) -> Any:
    return client.post(f"/api/runs/{thread_id}/fork", json=body or {})


def branch_of(reply: Any) -> str:
    first = reply.text.split("\n\n", 1)[0]
    return str(json.loads(first.removeprefix("data: "))["messageMetadata"]["threadId"])


def test_a_run_uses_the_service_specialist_by_default(
    client: TestClient, pair: tuple[_Specialist, _Specialist]
) -> None:
    text = chat(client, "un brief", "chat-a")
    assert "langchain a répondu" in text
    assert pair[1].calls == 0


def test_a_fork_can_pin_another_specialist(
    client: TestClient, pair: tuple[_Specialist, _Specialist]
) -> None:
    first, second = pair
    chat(client, "un brief", "chat-b")
    assert first.calls == 1

    reply = fork(client, "chat-b", brief="un autre brief", specialist="other")
    assert reply.status_code == 200
    assert "other a répondu" in reply.text
    assert second.calls == 1

    branch = client.get(f"/api/runs/{branch_of(reply)}").json()
    assert branch["specialist"] == "other"
    assert branch["parent"]["thread_id"] == "chat-b"
    # The original ran its own specialist, and only that one.
    assert first.calls == 1


def test_an_unavailable_specialist_is_refused_and_leaves_no_branch(client: TestClient) -> None:
    chat(client, "un brief", "chat-c")
    before = client.get("/api/runs", params={"limit": 50}).json()["items"]

    reply = fork(client, "chat-c", specialist="crewai")
    assert reply.status_code == 422
    assert "crewai" in reply.json()["detail"]

    after = client.get("/api/runs", params={"limit": 50}).json()["items"]
    assert [run["thread_id"] for run in after] == [run["thread_id"] for run in before]


def test_the_service_names_what_it_can_run(client: TestClient) -> None:
    items = client.get("/api/specialists").json()["items"]
    by_name = {item["name"]: item["identity"] for item in items}
    assert set(by_name) == {"chat-model", "other"}
    assert by_name["other"]["framework"] == "other"
    assert by_name["chat-model"]["framework"] == "langchain"


async def test_a_pinned_run_reaches_the_graph_through_its_own_config(
    pair: tuple[_Specialist, _Specialist],
) -> None:
    """The swap is read from the run's config, not from a process-wide setting."""
    first, second = pair
    graph = build_graph(
        _Planner(), first, specialists={"other": second}, checkpointer=InMemorySaver()
    )
    request = ChatRequest.model_validate(
        {"id": "chat-d", "messages": [{"role": "user", "parts": [{"type": "text", "text": "x"}]}]}
    )
    text = "".join([part async for part in run_stream(graph, request, specialist="other")])
    assert "other a répondu" in text
    assert first.calls == 0


def test_a_new_message_on_a_branch_keeps_its_specialist(
    client: TestClient, pair: tuple[_Specialist, _Specialist]
) -> None:
    """The thread remembers; the browser does not have to."""
    first, second = pair
    chat(client, "un brief", "chat-e")
    branch = branch_of(fork(client, "chat-e", brief="un autre brief", specialist="other"))
    assert second.calls == 1

    chat(client, "encore une tâche", branch)
    assert second.calls == 2
    assert first.calls == 1


def _langchain_specialist() -> Any:
    """The real LangChain adapter, on a scripted model: no network."""
    import httpx

    from usine_api.graph.specialist import ChatModelSpecialist
    from usine_api.models import ModelSettings

    def reply(_request: httpx.Request) -> httpx.Response:
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
                        "message": {"role": "assistant", "content": "réponse LangChain"},
                    }
                ],
                "usage": {"prompt_tokens": 3, "completion_tokens": 1, "total_tokens": 4},
            },
        )

    settings = ModelSettings(base_url="http://litellm.test/v1", api_key="sk-test", model="lab-fast")
    return ChatModelSpecialist(
        settings, http_client=httpx.AsyncClient(transport=httpx.MockTransport(reply))
    )


def _pydantic_specialist() -> Any:
    """The real Pydantic AI adapter, on a scripted model: no network."""
    import json as json_module

    from pydantic_ai.messages import ModelResponse, ToolCallPart
    from pydantic_ai.models.function import FunctionModel

    from usine_api.models import ModelSettings
    from usine_api.specialists.pydantic_verdict import PydanticVerdictSpecialist

    def verdict(_messages: Any, _info: Any) -> ModelResponse:
        payload = {
            "verdict": "passe",
            "motifs": [{"intitule": "demande claire", "preuve": "un brief court"}],
            "resume": "Rien d'interdit.",
        }
        return ModelResponse(
            parts=[ToolCallPart(tool_name="final_result", args=json_module.dumps(payload))]
        )

    settings = ModelSettings(base_url="http://litellm.test/v1", api_key="sk-test", model="lab-fast")
    return PydanticVerdictSpecialist(settings, model=FunctionModel(verdict))


def test_a_langchain_run_forked_into_pydantic_ai_gives_two_traced_branches() -> None:
    """MEM-33's flagship: the same run, two frameworks, each branch saying which."""
    app = create_app(
        planner=_Planner(),
        specialist=_langchain_specialist(),
        specialists={"pydantic-verdict": _pydantic_specialist()},
    )
    with TestClient(app) as client:
        original = chat(client, "un brief", "chat-f")
        assert '"framework": "langchain"' in original

        reply = fork(client, "chat-f", brief="un autre brief", specialist="pydantic-verdict")
        assert reply.status_code == 200
        assert '"framework": "pydantic-ai"' in reply.text
        assert "Verdict : passe." in reply.text

        branch = client.get(f"/api/runs/{branch_of(reply)}").json()
        assert branch["specialist"] == "pydantic-verdict"
        assert branch["parent"]["thread_id"] == "chat-f"
        assert branch["parent"]["checkpoint_id"]
        # The original is untouched and still LangChain.
        assert client.get("/api/runs/chat-f").json()["status"] == "done"
