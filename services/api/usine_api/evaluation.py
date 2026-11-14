"""Mesurer l'usine sur un jeu de runs, plutôt que sur l'impression du dernier.

C'est la couche que la carte de la stack 2026 donne pour la plus différenciante
et la moins répandue — 89 % des équipes ont de l'observabilité, 52 % ont des
evals. Ici elle est presque gratuite : un run est déjà un flux d'événements
conservé, donc l'évaluation n'a rien à instrumenter, seulement à lire.

Ce que ce module refuse de faire : appeler un modèle. Une évaluation qui
dépendrait d'un fournisseur ne serait ni reproductible ni gratuite, et on
cesserait de la lancer.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from statistics import median
from typing import Any

from .runs import Archive


@dataclass(frozen=True)
class RunMeasure:
    """Ce qu'on lit d'un run, sans jugement."""

    events: int
    agents: int
    #: Un run a produit une application quand un écran ET un comportement existent.
    served: bool
    replacements: int
    #: Remplacements refusés : la version fautive n'a pas pris, la précédente a servi.
    rollbacks: int
    #: Rang du premier événement où l'application devient utilisable. Sans horloge :
    #: le flux ne porte pas de date absolue, par construction (AD-33).
    first_screen_at: int | None
    tokens: int
    malformed: int


@dataclass(frozen=True)
class Report:
    """Le rapport. Deux exécutions sur le même jeu le rendent identique."""

    runs: int
    served_ratio: float
    replaced_ratio: float
    median_first_screen_rank: float | None
    mean_tokens: float
    mean_agents: float
    total_rollbacks: int
    total_malformed: int

    def as_json(self) -> dict[str, Any]:
        return {
            "runs": self.runs,
            "servedRatio": self.served_ratio,
            "replacedRatio": self.replaced_ratio,
            "medianFirstScreenRank": self.median_first_screen_rank,
            "meanTokens": self.mean_tokens,
            "meanAgents": self.mean_agents,
            "totalRollbacks": self.total_rollbacks,
            "totalMalformed": self.total_malformed,
        }


def measure(archive: Archive) -> RunMeasure:
    """Lit un run. Rien n'est déduit qui ne soit dans le flux."""
    agents = 0
    replacements = 0
    tokens = 0
    malformed = 0
    screen_at: int | None = None
    behaviour_at: int | None = None

    for rank, event in enumerate(archive.events, start=1):
        kind = event.get("type")

        if kind == "component-created":
            provides = event.get("provides")
            is_behaviour = isinstance(provides, list) and any(
                isinstance(name, str) and name.startswith("behaviour:") for name in provides
            )
            if is_behaviour:
                if behaviour_at is None:
                    behaviour_at = rank
            else:
                agents += 1
        elif kind == "screen-posted":
            if screen_at is None:
                screen_at = rank
        elif kind == "component-replaced":
            replacements += 1
        elif kind == "tokens-spent":
            tokens += int(event.get("input") or 0) + int(event.get("output") or 0)
        # Sur le champ `kind`, jamais sur la prose. Une mesure qui chercherait
        # un mot casserait le jour où quelqu'un reformule un message, et
        # casserait en silence. C'est la dernière branche : la fusionner en une
        # seule condition ne change rien pour les autres genres d'événement.
        elif kind == "message-emitted" and event.get("kind") == "malformed":
            malformed += 1

    served = screen_at is not None and behaviour_at is not None
    first_usable = max(screen_at, behaviour_at) if served else None

    # Un remplacement refusé ne produit pas d'événement de remplacement — il
    # n'a pas eu lieu. Ce qu'il produit est un message classé « rollback », et
    # c'est ce champ qu'on compte.
    rollbacks = sum(
        1
        for event in archive.events
        if event.get("type") == "message-emitted" and event.get("kind") == "rollback"
    )

    return RunMeasure(
        events=len(archive.events),
        agents=agents,
        served=served,
        replacements=replacements,
        rollbacks=rollbacks,
        first_screen_at=first_usable,
        tokens=tokens,
        malformed=malformed,
    )


def evaluate(archives: Iterable[Archive]) -> Report:
    """Le rapport d'ensemble. C'est l'écart entre deux rapports qui sert."""
    measures = [measure(archive) for archive in archives]
    total = len(measures)
    if total == 0:
        return Report(0, 0.0, 0.0, None, 0.0, 0.0, 0, 0)

    ranks = [m.first_screen_at for m in measures if m.first_screen_at is not None]

    return Report(
        runs=total,
        served_ratio=round(sum(1 for m in measures if m.served) / total, 3),
        # M7 : la part de runs où la démonstration a réellement eu lieu.
        replaced_ratio=round(sum(1 for m in measures if m.replacements > 0) / total, 3),
        median_first_screen_rank=round(median(ranks), 1) if ranks else None,
        mean_tokens=round(sum(m.tokens for m in measures) / total, 1),
        mean_agents=round(sum(m.agents for m in measures) / total, 2),
        total_rollbacks=sum(m.rollbacks for m in measures),
        total_malformed=sum(m.malformed for m in measures),
    )
