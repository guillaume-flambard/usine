"""Le spécialiste Pydantic AI : un verdict typé, jamais partiel (MEM-31).

Aucun réseau : `FunctionModel` joue le modèle, ce qui permet d'écrire à la main
une réponse valide, une réponse à côté, et de compter les tentatives.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import FunctionModel

from usine_api.contracts import Budget, SpecialistInput
from usine_api.models import ModelSettings
from usine_api.observability import record_verdict_attempts
from usine_api.specialists import available
from usine_api.specialists.pydantic_verdict import VerdictRefused, render

SETTINGS = ModelSettings(base_url="http://litellm.test/v1", api_key="sk-test", model="lab-fast")
BUDGET = Budget(max_tokens=200, max_seconds=5, max_tool_calls=2)
GOOD = {
    "verdict": "passe",
    "motifs": [{"intitule": "tâche claire", "preuve": "prépare une annonce"}],
    "resume": "Rien d'interdit dans la demande.",
}


def answers(*replies: dict[str, Any]) -> Any:
    """A model that plays the given replies in order, then repeats the last."""
    queue = list(replies)

    def model(_messages: Any, _info: Any) -> ModelResponse:
        payload = queue.pop(0) if len(queue) > 1 else queue[0]
        return ModelResponse(
            parts=[ToolCallPart(tool_name="final_result", args=json.dumps(payload))]
        )

    return FunctionModel(model)


def specialist(model: Any, *, retries: int = 2) -> Any:
    from usine_api.specialists.pydantic_verdict import PydanticVerdictSpecialist

    return PydanticVerdictSpecialist(SETTINGS, model=model, retries=retries)


async def test_a_valid_verdict_is_rendered_with_its_proofs() -> None:
    output = await specialist(answers(GOOD)).run(SpecialistInput(task="t", budget=BUDGET))
    assert output.answer.startswith("Verdict : passe.")
    assert "Rien d'interdit" in output.answer
    assert "preuve : prépare une annonce" in output.answer
    assert output.identity.framework == "pydantic-ai"
    assert output.tokens > 0
    assert output.actions == ()


async def test_a_wrong_shape_is_re_asked_then_refused() -> None:
    # The first attempt is a valid tool call with the wrong content: Pydantic AI
    # asks again; the second is also wrong, so the bounded retries run out.
    wrong = {"verdict": "peut-être", "motifs": [], "resume": ""}
    with pytest.raises(VerdictRefused):
        await specialist(answers(wrong, wrong), retries=1).run(
            SpecialistInput(task="t", budget=BUDGET)
        )


async def test_a_plain_text_answer_never_becomes_a_verdict() -> None:
    def text_only(_messages: Any, _info: Any) -> ModelResponse:
        return ModelResponse(parts=[TextPart(content="je pense que ça passe")])

    with pytest.raises(VerdictRefused):
        await specialist(FunctionModel(text_only), retries=1).run(
            SpecialistInput(task="t", budget=BUDGET)
        )


async def test_a_recovered_attempt_is_a_valid_verdict() -> None:
    wrong = {"verdict": "peut-être", "motifs": [], "resume": ""}
    output = await specialist(answers(wrong, GOOD)).run(SpecialistInput(task="t", budget=BUDGET))
    assert output.answer.startswith("Verdict : passe.")


def test_the_verdict_is_a_registered_implementation() -> None:
    assert "pydantic-verdict" in available()


def test_the_attempts_land_on_the_trace(monkeypatch: pytest.MonkeyPatch) -> None:
    from usine_api import observability

    sent: list[dict[str, Any]] = []

    class FakeClient:
        def create_score(self, **kwargs: Any) -> None:
            sent.append(kwargs)

    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")
    monkeypatch.setattr(observability, "ensure_config", lambda: {"callbacks": [_Handler()]})
    monkeypatch.setattr("langfuse.get_client", lambda: FakeClient())
    monkeypatch.setattr(observability, "_warned", set())

    record_verdict_attempts(attempts=2, specialist="pydantic:lab-fast", refused=False)

    assert sent and sent[0]["name"] == "verdict/tentatives"
    assert sent[0]["value"] == 2.0
    assert "2 tentative" in sent[0]["comment"]
    assert sent[0]["trace_id"] == "trace-1"


class _Handler:
    last_trace_id = "trace-1"


def test_the_render_keeps_every_motif() -> None:
    from usine_api.specialists.pydantic_verdict import Motif, Verdict

    verdict = Verdict(
        verdict="echoue",
        motifs=[Motif(intitule="adresse fournie", preuve="https://exemple.test")],
        resume="Une adresse ne vient jamais du modèle.",
    )
    rendered = render(verdict)
    assert rendered.startswith("Verdict : echoue.")
    assert "https://exemple.test" in rendered


def test_a_service_with_a_gateway_offers_every_framework(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """MEM-33's swap needs two real implementations on the same service."""
    from fastapi.testclient import TestClient

    from usine_api.app import create_app

    monkeypatch.setenv("LITELLM_BASE_URL", "http://litellm.test/v1")
    monkeypatch.setenv("LITELLM_API_KEY", "sk-test")

    with TestClient(create_app()) as client:
        items = client.get("/api/specialists").json()["items"]
    frameworks = {item["name"]: item["identity"]["framework"] for item in items}
    assert frameworks == {
        "chat-model": "langchain",
        "pydantic-verdict": "pydantic-ai",
        "openai-agents": "openai-agents",
    }
