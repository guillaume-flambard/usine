"""Ce qui borne un visiteur, et ce qui borne la journée.

Porté depuis le relais Node à l'identique : les valeurs ont été mesurées en
production, pas devinées, et les changer ici change la facture.

Le compteur est en mémoire, comme il l'était. C'est assumé et c'est écrit :
un redémarrage remet les compteurs à zéro, ce qui est acceptable tant qu'un
seul processus sert. Le jour où il y en aura deux, ce module devra s'adosser à
la base — et ce sera visible ici plutôt qu'enfoui.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass(frozen=True)
class Limits:
    """Les bornes dures. Un visiteur ne peut pas faire dériver la facture."""

    max_context: int = 6_000
    max_instruction: int = 1_200
    max_body: int = 20_000
    # Un tour d'agent est du JSON et peut porter le code d'un outil : 400
    # tokens le coupaient au milieu, et un tour coupé est un tour illisible.
    max_output: int = 1_200
    per_minute: int = 40
    # Un run coûte une quarantaine d'appels. Deux runs par visiteur et par jour
    # est tout l'intérêt de cette borne : sans elle, la capacité du jour
    # appartient au premier arrivé et tous les suivants voient une page morte.
    per_visitor_per_day: int = 90
    # Relevé avec la borne par visiteur en place : le plafond global n'a plus à
    # protéger le site d'un seul curieux.
    per_day: int = 4_000
    # Le coût approximatif d'un run, pour que la page convertisse des appels en
    # runs sans coder en dur un nombre qui dériverait des budgets.
    calls_per_run: int = 45


@dataclass
class Remaining:
    """Ce qu'il reste, sans rien consommer."""

    visitor: int
    site: int


@dataclass
class _Day:
    date: str = ""
    total: int = 0
    per_visitor: dict[str, int] = field(default_factory=dict)


class RateLimiter:
    """Par adresse pour la minute et pour la journée, global pour la journée.

    Les deux bornes ne protègent pas la même chose : la globale protège la
    facture, celle par visiteur protège les autres visiteurs.
    """

    def __init__(
        self,
        limits: Limits | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._limits = limits or Limits()
        self._clock = clock
        self._hits: dict[str, list[float]] = {}
        self._day = _Day()

    @property
    def limits(self) -> Limits:
        return self._limits

    def _today(self) -> _Day:
        """Fait tourner la journée. Les compteurs d'hier ne sont pas reportés."""
        now = self._clock()
        date = datetime.fromtimestamp(now, tz=UTC).date().isoformat()
        if date != self._day.date:
            self._day = _Day(date=date)
        return self._day

    def remaining(self, address: str) -> Remaining:
        """Ce qu'il reste. La page lit ceci avant chaque run, donc il ne coûte rien."""
        day = self._today()
        spent = day.per_visitor.get(address, 0)
        return Remaining(
            visitor=max(0, self._limits.per_visitor_per_day - spent),
            site=max(0, self._limits.per_day - day.total),
        )

    def allow(self, address: str) -> str | None:
        """Consomme un appel, ou dit pourquoi il est refusé."""
        now = self._clock()
        day = self._today()

        if day.total >= self._limits.per_day:
            return "capacité du jour atteinte pour le site"

        spent = day.per_visitor.get(address, 0)
        if spent >= self._limits.per_visitor_per_day:
            return "capacité du jour atteinte pour vous"

        recent = [t for t in self._hits.get(address, []) if now - t < 60]
        if len(recent) >= self._limits.per_minute:
            return "trop de demandes, réessayez dans une minute"

        recent.append(now)
        self._hits[address] = recent
        day.total += 1
        day.per_visitor[address] = spent + 1
        return None
