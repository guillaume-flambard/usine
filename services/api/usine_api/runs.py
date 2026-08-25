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
import time
from collections.abc import Callable
from dataclasses import dataclass, replace
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


@dataclass(frozen=True)
class Owned:
    """Un run et son appartenance. L'org et le partage vivent à côté du flux,
    jamais dedans : le flux reste le format d'archive (AD-33)."""

    archive: Archive
    owner: str
    shared: bool = False
    #: Quand le run a été mis à la corbeille (heure absolue), ou `None` s'il est
    #: vivant. Un run en corbeille est retenu mais invisible : ni listé, ni
    #: résolu par lien. Seule la purge le retire pour de bon.
    trashed_at: float | None = None


class RunStore(Protocol):
    """Le port. Postgres le remplira sans que les routes changent.

    Chaque run appartient à une organisation. Un `viewer` (org, ou `None` pour
    un visiteur anonyme) ne voit un run que s'il en est propriétaire, ou si le
    run a été explicitement partagé — et jamais s'il est en corbeille.
    """

    def put(self, run_id: str, archive: Archive, owner: str) -> None: ...

    def get(self, run_id: str, viewer: str | None) -> Archive | None: ...

    def list_for(self, owner: str) -> list[tuple[str, Owned]]: ...

    def list_trashed(self, owner: str) -> list[tuple[str, Owned]]: ...

    def share(self, run_id: str, owner: str) -> bool: ...

    def revoke(self, run_id: str, owner: str) -> bool: ...

    def delete(self, run_id: str, owner: str) -> bool:
        """Met le run à la corbeille (réversible), ne le détruit pas."""
        ...

    def restore(self, run_id: str, owner: str) -> bool: ...

    def purge(self, run_id: str, owner: str) -> bool:
        """Retire définitivement un run en corbeille (propriétaire seul)."""
        ...

    def purge_expired(self, older_than_seconds: float) -> int:
        """Retire les runs en corbeille depuis plus longtemps que la fenêtre."""
        ...

    def forget_owner(self, owner: str) -> int:
        """Efface tous les runs d'une org (vivants et en corbeille). RGPD."""
        ...

    def count(self) -> int: ...

    def all(self) -> list[Archive]: ...


class InMemoryRunStore:
    """Suffisant tant qu'un seul processus sert, et honnête sur sa limite.

    Un redémarrage perd les runs stockés. C'est acceptable pour le premier
    tour — un lien partagé vaut le temps d'un entretien — et ce sera visible
    ici plutôt qu'enfoui le jour où ça ne l'est plus.
    """

    def __init__(self, capacity: int = 500, *, now: Callable[[], float] = time.time) -> None:
        self._runs: dict[str, Owned] = {}
        self._capacity = capacity
        self._now = now

    def _owned(self, run_id: str, owner: str, *, live_only: bool = False) -> Owned | None:
        """L'entrée si elle appartient à `owner` (et, au besoin, n'est pas en
        corbeille), sinon `None`."""
        entry = self._runs.get(run_id)
        if entry is None or entry.owner != owner:
            return None
        if live_only and entry.trashed_at is not None:
            return None
        return entry

    def put(self, run_id: str, archive: Archive, owner: str) -> None:
        if len(self._runs) >= self._capacity:
            # Le plus ancien part. Un stockage sans borne sur un service public
            # est une fuite de mémoire avec un nom flatteur.
            oldest = next(iter(self._runs))
            del self._runs[oldest]
        self._runs[run_id] = Owned(archive=archive, owner=owner)

    def get(self, run_id: str, viewer: str | None) -> Archive | None:
        entry = self._runs.get(run_id)
        if entry is None or entry.trashed_at is not None:
            # Un run en corbeille est indistinct d'un run absent.
            return None
        # Propriétaire, ou run partagé : sinon indistinct d'un run inexistant
        # (on ne fuite pas l'existence à une autre org).
        if entry.shared or entry.owner == viewer:
            return entry.archive
        return None

    def list_for(self, owner: str) -> list[tuple[str, Owned]]:
        return [
            (run_id, entry)
            for run_id, entry in self._runs.items()
            if entry.owner == owner and entry.trashed_at is None
        ]

    def list_trashed(self, owner: str) -> list[tuple[str, Owned]]:
        return [
            (run_id, entry)
            for run_id, entry in self._runs.items()
            if entry.owner == owner and entry.trashed_at is not None
        ]

    def share(self, run_id: str, owner: str) -> bool:
        entry = self._owned(run_id, owner, live_only=True)
        if entry is None:
            return False
        self._runs[run_id] = replace(entry, shared=True)
        return True

    def revoke(self, run_id: str, owner: str) -> bool:
        entry = self._owned(run_id, owner, live_only=True)
        if entry is None:
            return False
        self._runs[run_id] = replace(entry, shared=False)
        return True

    def delete(self, run_id: str, owner: str) -> bool:
        # Corbeille, pas destruction : réversible, et le lien cesse de résoudre.
        entry = self._owned(run_id, owner, live_only=True)
        if entry is None:
            return False
        self._runs[run_id] = replace(entry, trashed_at=self._now())
        return True

    def restore(self, run_id: str, owner: str) -> bool:
        entry = self._owned(run_id, owner)
        if entry is None or entry.trashed_at is None:
            return False
        self._runs[run_id] = replace(entry, trashed_at=None)
        return True

    def purge(self, run_id: str, owner: str) -> bool:
        entry = self._owned(run_id, owner)
        # On ne purge que ce qui est en corbeille : purger un run vivant
        # contournerait la corbeille.
        if entry is None or entry.trashed_at is None:
            return False
        del self._runs[run_id]
        return True

    def purge_expired(self, older_than_seconds: float) -> int:
        cutoff = self._now() - older_than_seconds
        stale = [
            run_id
            for run_id, entry in self._runs.items()
            if entry.trashed_at is not None and entry.trashed_at < cutoff
        ]
        for run_id in stale:
            del self._runs[run_id]
        return len(stale)

    def forget_owner(self, owner: str) -> int:
        gone = [run_id for run_id, entry in self._runs.items() if entry.owner == owner]
        for run_id in gone:
            del self._runs[run_id]
        return len(gone)

    def count(self) -> int:
        return len(self._runs)

    def all(self) -> list[Archive]:
        return [entry.archive for entry in self._runs.values()]


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
