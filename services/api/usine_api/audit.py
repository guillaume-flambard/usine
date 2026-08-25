"""Le journal d'audit des actions sensibles.

Depuis la tenancy, une action destructrice ou exposante (partage, corbeille,
purge…) appartient à une org : on la trace, pour qu'elle ne soit jamais anonyme.
Append-only par construction — aucune méthode ne modifie ni ne supprime une
entrée — et sans secret : on journalise org/action/cible, jamais un jeton.

Derrière un port, comme le reste : impl en mémoire pour les tests, Postgres en
production.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class AuditEntry:
    """Une action sensible, attribuée à une org. Aucun secret n'y entre."""

    org: str
    action: str
    target: str
    at: float

    def as_json(self) -> dict[str, Any]:
        # `org` n'est pas ressorti : l'appelant ne lit que sa propre org.
        return {"action": self.action, "target": self.target, "at": self.at}


class AuditLog(Protocol):
    def record(self, org: str, action: str, target: str) -> None: ...

    def entries(self, org: str) -> list[AuditEntry]: ...


class InMemoryAuditLog:
    """Suffisant pour les tests ; un redémarrage perd le journal (assumé)."""

    def __init__(self, *, now: Callable[[], float] = time.time) -> None:
        self._entries: list[AuditEntry] = []
        self._now = now

    def record(self, org: str, action: str, target: str) -> None:
        self._entries.append(AuditEntry(org=org, action=action, target=target, at=self._now()))

    def entries(self, org: str) -> list[AuditEntry]:
        # Une org ne lit que les siennes.
        return [entry for entry in self._entries if entry.org == org]
