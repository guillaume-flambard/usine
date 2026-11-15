"""Le spécialiste Pydantic AI : un verdict typé et validé (MEM-31).

C'est le juge des portes : on ne lui demande pas de rédiger la tâche mais de
dire si elle passe, échoue ou reste incertaine, avec au moins un motif et sa
preuve. Sa sortie est un modèle Pydantic que le framework valide : si le modèle
répond à côté, Pydantic AI redemande (borné), puis lève une erreur typée. Un
verdict partiel ne sort jamais de ce spécialiste.

Doc lue pour la version installée (**pydantic-ai-slim 2.68.0**, `uv.lock`) :
https://ai.pydantic.dev — agents, sorties structurées (`output_type`), modèles
compatibles OpenAI (`OpenAIChatModel` + `OpenAIProvider(base_url=...)`), et
`retries` pour les nouvelles tentatives de validation.

Le verdict est rendu dans `answer` (le canal du contrat Specialist, celui que
l'écran lit) ; le typage sert à garantir ce qui y arrive, pas à changer la
forme du graphe.
"""

from __future__ import annotations

import os
from importlib.metadata import version
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

from usine_api.contracts import SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.models import ModelSettings
from usine_api.observability import record_verdict_attempts
from usine_api.specialists import register

#: Pydantic AI prints a startup banner on import; in a service log it is noise.
os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

VerdictKind = Literal["passe", "echoue", "incertain"]

INSTRUCTIONS = (
    "Tu es le juge des portes de l'usine. On te donne une tâche à exécuter par un "
    "agent. Tu ne la rédiges pas, tu la juges : verdict `passe` si elle peut être "
    "exécutée telle quelle, `echoue` si elle demande quelque chose d'interdit "
    "(une adresse fournie par le modèle, une action irréversible sans porte, une "
    "donnée personnelle), `incertain` si la tâche ne permet pas de trancher. "
    "Donne au moins un motif, chacun avec sa preuve : la partie de la tâche dont "
    "il vient. Pas de verdict sans preuve."
)


class Motif(BaseModel):
    """Un motif de verdict, et la partie de la tâche qui le fonde."""

    intitule: str = Field(min_length=1)
    preuve: str = Field(min_length=1)


class Verdict(BaseModel):
    verdict: VerdictKind
    motifs: list[Motif] = Field(min_length=1)
    resume: str = Field(min_length=1)


class VerdictRefused(Exception):
    """The model never produced a valid verdict, even after the bounded retries."""


def render(verdict: Verdict) -> str:
    """The verdict as the screen reads it: French, motifs and proofs included."""
    lines = [f"Verdict : {verdict.verdict}.", verdict.resume]
    for motif in verdict.motifs:
        lines.append(f"- {motif.intitule} (preuve : {motif.preuve})")
    return "\n".join(lines)


@register("pydantic-verdict")
class PydanticVerdictSpecialist:
    """`pydantic-verdict` in the registry: a typed verdict, never a partial one."""

    def __init__(
        self,
        settings: ModelSettings,
        *,
        http_client: httpx.AsyncClient | None = None,
        retries: int = 2,
        model: Any | None = None,
    ) -> None:
        self.identity = SpecialistIdentity(
            name=f"pydantic:{settings.model}",
            framework="pydantic-ai",
            framework_version=version("pydantic-ai-slim"),
        )
        self._settings = settings
        self._client = http_client
        self._retries = retries
        self._model = model

    def _agent(self) -> Any:
        from pydantic_ai import Agent

        return Agent(
            self._model or self._openai_model(),
            output_type=Verdict,
            retries=self._retries,
            instructions=INSTRUCTIONS,
            name="juge-des-portes",
        )

    def _openai_model(self) -> Any:
        """LiteLLM, through the service's own client so cassettes apply."""
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider

        provider = OpenAIProvider(
            base_url=self._settings.base_url,
            api_key=self._settings.api_key or "unused",
            http_client=self._client,
        )
        return OpenAIChatModel(self._settings.model, provider=provider)

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        from pydantic_ai.exceptions import UnexpectedModelBehavior

        try:
            result = await self._agent().run(task.task)
        except UnexpectedModelBehavior as error:
            # Bounded retries exhausted: a typed refusal, never a half verdict.
            record_verdict_attempts(
                attempts=self._retries + 1, specialist=self.identity.name, refused=True
            )
            raise VerdictRefused(f"aucun verdict valide après {self._retries} reprises") from error

        usage = result.usage
        if usage.requests > 1:
            # In the trace: a verdict that had to be asked twice is a fact about
            # this run, not a detail to lose.
            record_verdict_attempts(
                attempts=int(usage.requests or 1),
                specialist=self.identity.name,
                refused=False,
            )
        return SpecialistOutput(
            answer=render(result.output),
            identity=self.identity,
            tokens=int(usage.total_tokens or 0),
            tool_calls=int(usage.tool_calls or 0),
        )
