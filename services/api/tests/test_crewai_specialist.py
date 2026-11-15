"""Le spécialiste CrewAI (MEM-78) : la conformité, quand CrewAI est là.

CrewAI ne peut pas être installé dans l'environnement du service (`openai<3`
contre `openai>=3.31` pour Pydantic AI). Ce test est donc **sauté** ici et
**exécuté dans le venv de CrewAI** :

    PYTHONPATH=services/api python -m pytest services/api/tests/test_crewai_specialist.py

C'est la preuve de conformité du quatrième framework, produite là où il vit.
"""

from __future__ import annotations

from typing import Any

import pytest

from usine_api.contracts import Budget, SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.specialists.contract import execute

crewai = pytest.importorskip("crewai", reason="CrewAI vit dans son propre environnement")

BUDGET = Budget(max_tokens=500, max_seconds=60, max_tool_calls=0)


class FakeLLM(crewai.LLM):  # type: ignore[misc]
    """CrewAI's own LLM base, answered without a network call."""

    def call(self, messages: Any, *args: Any, **kwargs: Any) -> str:
        return "réponse CrewAI"

    async def acall(self, messages: Any, *args: Any, **kwargs: Any) -> str:
        return self.call(messages, *args, **kwargs)


def build() -> Any:
    from types import SimpleNamespace

    from usine_api.specialists.crewai import CrewAISpecialist

    gateway = SimpleNamespace(
        base_url="http://litellm.test/v1", api_key="sk-test", model="lab-fast"
    )
    return CrewAISpecialist(gateway, llm=FakeLLM(model="openai/lab-fast", is_litellm=True))


def test_it_satisfies_the_contract() -> None:
    specialist = build()
    assert isinstance(specialist.identity, SpecialistIdentity)
    assert specialist.identity.framework == "crewai"
    assert specialist.identity.framework_version


async def test_it_answers_and_carries_its_identity() -> None:
    specialist = build()
    output = await specialist.run(SpecialistInput(task="résume la situation", budget=BUDGET))
    assert isinstance(output, SpecialistOutput)
    assert output.answer.strip()
    assert output.identity == specialist.identity
    assert output.tokens >= 0
    assert output.tool_calls == 0
    assert output.actions == ()


async def test_the_adapter_runs_it_within_budget() -> None:
    assert (await execute(build(), "une tâche", BUDGET)).answer
