"""Le contrat Specialist : un rôle, n'importe quel framework (MEM-27).

LangChain, CrewAI, OpenAI Agents SDK, Pydantic AI et Claude Agent SDK remplissent
le même rôle derrière cette interface, ce qui permet de remplacer l'un par
l'autre sur une branche forkée (MEM-33) et de comparer honnêtement (MEM-34).

Trois choses ne se négocient pas, et un test de conformité les rejoue sur chaque
implémentation :

- une **identité** (nom, framework, version) : une trace doit dire qui a répondu ;
- un **budget** (jetons, durée, appels d'outils) appliqué de la même façon pour
  tous, par l'adaptateur et non par chaque implémentation ;
- des **outils nommés**, jamais des adresses : un modèle ne remet pas au service
  une URL à appeler.

Les modèles Pydantic (`Budget`, `SpecialistInput`, `SpecialistOutput`,
`SpecialistIdentity`, `ToolName`) vivent dans `usine_api.contracts.specialist`,
pas ici : leur chemin de module est inscrit dans les checkpoints LangGraph
(`checkpoints.py`, `SERDE`, `allowed_msgpack_modules`), donc les déplacer
casserait la relecture des runs déjà enregistrés. Ils sont ré-exportés ici pour
que le contrat se lise d'un seul endroit.
"""

from __future__ import annotations

import asyncio
import time
from typing import Protocol, runtime_checkable

from usine_api.contracts import (
    Budget,
    SpecialistIdentity,
    SpecialistInput,
    SpecialistOutput,
    ToolName,
)

__all__ = [
    "Budget",
    "BudgetExceeded",
    "Gateway",
    "Specialist",
    "SpecialistIdentity",
    "SpecialistInput",
    "SpecialistOutput",
    "ToolName",
    "execute",
]


@runtime_checkable
class Gateway(Protocol):
    """What a specialist needs to reach the model gateway, and nothing more.

    Structural on purpose: `ModelSettings` satisfies it without being imported,
    so an adapter can live in an environment that has no LangChain at all (the
    multi-environment comparator, MEM-34).
    """

    base_url: str
    api_key: str
    model: str


@runtime_checkable
class Specialist(Protocol):
    """What every framework adapter exposes, and nothing more."""

    identity: SpecialistIdentity

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        """Answer one sub-task within the budget it carries."""
        ...


class BudgetExceeded(Exception):
    """A specialist went past its budget; the adapter, not the specialist, raises.

    Typed rather than a string so the caller can tell a budget stop from a model
    failure, and so the screen can say which limit was hit.
    """

    def __init__(
        self,
        kind: str,
        *,
        specialist: SpecialistIdentity,
        limit: float,
        actual: float,
    ) -> None:
        self.kind = kind
        self.specialist = specialist
        self.limit = limit
        self.actual = actual
        super().__init__(
            f"{specialist.name} a dépassé son budget ({kind}) : {actual} pour une limite de {limit}"
        )


async def execute(
    specialist: Specialist,
    task: str,
    budget: Budget,
    *,
    tools: tuple[ToolName, ...] = (),
) -> SpecialistOutput:
    """Run one sub-task under the budget, and refuse what goes past it.

    Budget only: the trace wrapper lives with the graph adapter (`node.py`), so
    this function is importable without LangChain.
    """
    entry = SpecialistInput(task=task, budget=budget, tools=tools)
    started = time.perf_counter()
    try:
        output = await asyncio.wait_for(specialist.run(entry), timeout=budget.max_seconds)
    except TimeoutError as error:
        raise BudgetExceeded(
            "durée",
            specialist=specialist.identity,
            limit=budget.max_seconds,
            actual=round(time.perf_counter() - started, 3),
        ) from error
    if output.tokens > budget.max_tokens:
        raise BudgetExceeded(
            "jetons",
            specialist=specialist.identity,
            limit=budget.max_tokens,
            actual=output.tokens,
        )
    if output.tool_calls > budget.max_tool_calls:
        raise BudgetExceeded(
            "appels d'outils",
            specialist=specialist.identity,
            limit=budget.max_tool_calls,
            actual=output.tool_calls,
        )
    return output
