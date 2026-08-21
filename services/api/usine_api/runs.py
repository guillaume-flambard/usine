"""Les runs stockés.

Un run est un flux d'événements et rien d'autre — c'est ce que l'architecture
promet depuis le début, et c'est ce qui rend le stockage trivial : il n'y a
rien à modéliser, seulement à conserver.

Le stockage est derrière un port. L'implémentation en mémoire suffit
aujourd'hui et se remplace par Postgres sans toucher aux routes ; l'écrire
ainsi coûte dix lignes et évite qu'une base soit nécessaire pour un test.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Any, Protocol

#: La version du format, la même que côté navigateur. Un run d'une autre
#: version est refusé plutôt que deviné.
ARCHIVE_VERSION = 1

#: Un run porte le code de ses comportements : il est gros, mais pas illimité.
MAX_ARCHIVE_BYTES = 2_000_000

#: Assez d'entropie pour qu'un lien ne se devine pas, assez court pour se lire.
ID_BYTES = 9


class Stored(Exception):
    """Un run qu'on refuse de stocker, avec la raison et le code."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


@dataclass(frozen=True)
class Archive:
    """Ce qui est conservé. Rien n'est dérivé : tout était déjà dans le flux."""

    version: int
    brief: str
    events: list[Any]

    def as_json(self) -> dict[str, Any]:
        return {"version": self.version, "brief": self.brief, "events": self.events}


class RunStore(Protocol):
    """Le port. Postgres le remplira sans que les routes changent."""

    def put(self, run_id: str, archive: Archive) -> None: ...

    def get(self, run_id: str) -> Archive | None: ...

    def count(self) -> int: ...

    def all(self) -> list[Archive]: ...


class InMemoryRunStore:
    """Suffisant tant qu'un seul processus sert, et honnête sur sa limite.

    Un redémarrage perd les runs stockés. C'est acceptable pour le premier
    tour — un lien partagé vaut le temps d'un entretien — et ce sera visible
    ici plutôt qu'enfoui le jour où ça ne l'est plus.
    """

    def __init__(self, capacity: int = 500) -> None:
        self._runs: dict[str, Archive] = {}
        self._capacity = capacity

    def put(self, run_id: str, archive: Archive) -> None:
        if len(self._runs) >= self._capacity:
            # Le plus ancien part. Un stockage sans borne sur un service public
            # est une fuite de mémoire avec un nom flatteur.
            oldest = next(iter(self._runs))
            del self._runs[oldest]
        self._runs[run_id] = archive

    def get(self, run_id: str) -> Archive | None:
        return self._runs.get(run_id)

    def count(self) -> int:
        return len(self._runs)

    def all(self) -> list[Archive]:
        return list(self._runs.values())


def read_archive(body: Any, *, raw_size: int) -> Archive:
    """Relit ce qu'un navigateur a poussé.

    C'est une donnée hostile : elle peut avoir été fabriquée à la main, et son
    code sera exécuté chez celui qui ouvrira le lien. Ce qui protège n'est pas
    cette fonction — c'est le fil isolé côté client — mais rien ne justifie
    d'accepter ici ce qu'on ne comprend pas.
    """
    if raw_size > MAX_ARCHIVE_BYTES:
        raise Stored(413, "run trop gros pour être conservé")
    if not isinstance(body, dict):
        raise Stored(400, "run illisible")
    if body.get("version") != ARCHIVE_VERSION:
        raise Stored(400, f"version de run inconnue : {body.get('version')}")

    events = body.get("events")
    if not isinstance(events, list) or not events:
        raise Stored(400, "un run sans événement n'est pas un run")

    kept = [
        event
        for event in events
        if isinstance(event, dict)
        and isinstance(event.get("type"), str)
        and isinstance(event.get("sequence"), int)
    ]
    if not kept:
        raise Stored(400, "aucun événement lisible dans ce run")

    brief = body.get("brief")
    return Archive(
        version=ARCHIVE_VERSION,
        brief=brief if isinstance(brief, str) else "",
        # Remis en ordre au stockage : un fichier réordonné à la main ne doit
        # pas produire un graphe incohérent chez celui qui l'ouvrira.
        events=sorted(kept, key=lambda event: event["sequence"]),
    )


def new_id() -> str:
    return secrets.token_urlsafe(ID_BYTES)
