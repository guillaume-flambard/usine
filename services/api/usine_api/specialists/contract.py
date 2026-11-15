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
    "Specialist",
    "SpecialistIdentity",
    "SpecialistInput",
    "SpecialistOutput",
    "ToolName",
]


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
