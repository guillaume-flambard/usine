"""Le spécialiste CrewAI : le quatrième framework, dans son environnement (MEM-78).

CrewAI ne peut pas vivre dans l'environnement du service : il plafonne
`openai<3` quand Pydantic AI exige `openai>=3.31` (vérifié le 2026-11-15). Ce
module n'importe donc **rien** du service au-delà du contrat et du rapport, et
CrewAI lui-même n'est importé qu'au moment de l'utiliser : le service démarre
sans le payer, et `scripts/compare-one.py` le fait tourner dans son venv.

Deux honnêtetés :

- CrewAI construit son propre client HTTP (via LiteLLM), donc la cassette de
  rejeu (MEM-24) ne s'applique pas à lui. Son rapport est produit en direct, et
  le comparateur ne le prétend pas rejouable ;
- sa télémétrie est coupée (`OTEL_SDK_DISABLED`), comme les traces OpenAI du
  spécialiste précédent : un run de l'usine ne sort pas de chez nous.
"""

from __future__ import annotations

import os
from importlib.metadata import version
from typing import Any

from usine_api.contracts import SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.specialists import register
from usine_api.specialists.contract import Gateway

#: Read by CrewAI's OpenTelemetry export; set before it is imported.
os.environ.setdefault("OTEL_SDK_DISABLED", "true")

ROLE = "Spécialiste de l'usine agentique"
GOAL = "Répondre à une tâche en français, en trois phrases au plus, sans rien inventer."
BACKSTORY = (
    "Tu réponds à une seule tâche, courte, et tu ne proposes aucune action "
    "irréversible : celles-là passent par la porte humaine, pas par toi."
)


@register("crewai")
class CrewAISpecialist:
    """`crewai` in the registry: one agent, one task, the same contract."""

    def __init__(
        self,
        gateway: Gateway,
        *,
        llm: Any | None = None,
    ) -> None:
        self.identity = SpecialistIdentity(
            name=f"crewai:{gateway.model}",
            framework="crewai",
            framework_version=version("crewai"),
        )
        self._gateway = gateway
        self._llm = llm

    def _language_model(self) -> Any:
        if self._llm is not None:
            return self._llm
        from crewai import LLM

        # CrewAI talks to LiteLLM itself; base_url and key go through kwargs.
        return LLM(
            model=f"openai/{self._gateway.model}",
            is_litellm=True,
            base_url=self._gateway.base_url,
            api_key=self._gateway.api_key,
        )

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        from crewai import Agent, Crew, Task

        agent = Agent(
            role=ROLE,
            goal=GOAL,
            backstory=BACKSTORY,
            llm=self._language_model(),
            verbose=False,
            allow_delegation=False,
        )
        job = Task(
            description=task.task,
            expected_output="Une réponse courte en français.",
            agent=agent,
        )
        crew = Crew(agents=[agent], tasks=[job], verbose=False)
        output = await crew.kickoff_async()
        usage = getattr(output, "token_usage", None)
        return SpecialistOutput(
            answer=str(getattr(output, "raw", "") or "").strip(),
            identity=self.identity,
            tokens=int(getattr(usage, "total_tokens", 0) or 0),
            tool_calls=0,
        )
