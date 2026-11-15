"""L'archive d'un run : l'exporter, la relire en rejeu (MEM-26).

Un run v2 se lit depuis ses tours, et chaque tour porte les `RunEvent` qu'il a
émis : c'est le modèle de lecture, et c'est ce que l'archive conserve (règle 2
de l'architecture : le flux est le format d'archive). Relire une archive crée
un run neuf, en rejeu : rien n'est exécuté, aucun modèle n'est appelé. Le run
importé n'a pas de checkpoint, donc il se lit mais ne se forke ni ne reprend.

Ce que l'archive ne porte pas, et pourquoi :

- l'identifiant du fil, l'organisation, les dates et le parent d'une branche :
  ils appartiennent au serveur d'origine et ne disent rien dans un autre.
  L'événement `run-started` nomme son fil : l'export retire ce nom, l'import y
  écrit celui du run neuf ;
- la porte en attente : seul un run fini s'exporte, un run arrêté devant une
  porte ne peut pas être rejoué sans ses checkpoints ;
- la cassette : en v2 il n'y en a qu'une, celle du service (MEM-24), partagée
  par tous les runs. L'exporter avec un run donnerait les appels des autres.

Les champs exportés sont listés dans `tests/test_archive.py` et le schéma est
publié dans `docs/schemas/run-archive.v1.json`. Ajouter un champ est une
décision de confidentialité, pas un détail.
"""

from __future__ import annotations

import json
import math
from collections.abc import Callable
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from usine_api.contracts import RunEvent, RunEventKind
from usine_api.threads import RunDetail, RunTurn, title_of

FORMAT = "usine.run"
VERSION = 1

#: How to bring an older archive up to the current version, one step each.
#: Empty while there is only one version; a format change adds a step here.
MIGRATIONS: dict[int, Callable[[dict[str, Any]], dict[str, Any]]] = {}

FINISHED = ("done", "error")

#: The same bound as the v1 archive: a run is large, not unbounded.
MAX_RUN_ARCHIVE_BYTES = 2_000_000

#: More turns than any real run has; past it, an archive is a flood.
MAX_TURNS = 200


class ArchiveRefused(Exception):
    """An archive this service will not read; the message says why."""


class ArchivedTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brief: str
    answer: str = ""
    events: list[RunEvent]


class ArchivedRun(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    status: Literal["done", "error"]
    specialist: str | None = None
    turns: list[ArchivedTurn] = Field(max_length=MAX_TURNS)


class RunArchive(BaseModel):
    """A finished run, without anything that belongs to the server it came from."""

    model_config = ConfigDict(extra="forbid", title="Usine run archive")

    format: Literal["usine.run"] = FORMAT
    version: Literal[1] = VERSION
    run: ArchivedRun


def export_of(detail: RunDetail) -> RunArchive:
    if detail.status not in FINISHED:
        raise ArchiveRefused("Seul un run terminé s'exporte : celui-ci n'est pas fini.")
    return RunArchive(
        run=ArchivedRun(
            title=detail.title,
            status=detail.status,  # type: ignore[arg-type]
            specialist=detail.specialist,
            turns=[
                ArchivedTurn(
                    brief=turn.brief,
                    answer=turn.answer,
                    events=[_without_thread(RunEvent.model_validate(e)) for e in turn.events],
                )
                for turn in detail.history
            ],
        )
    )


def file_name(thread_id: str) -> str:
    """A download name that cannot break the header it travels in."""
    safe = "".join(c for c in thread_id if c.isascii() and (c.isalnum() or c in "-_"))
    return f"run-{safe[:64] or 'archive'}.json"


def _refuse_constant(name: str) -> Any:
    raise ValueError(f"constante JSON refusée : {name}")


def _finite(text: str) -> float:
    value = float(text)
    if not math.isfinite(value):
        raise ValueError("nombre infini refusé")
    return value


def parse_archive(body: bytes) -> RunArchive:
    """Read an uploaded archive from its bytes, refusing what Postgres cannot store.

    `json.loads` accepts `NaN`, `Infinity` and `1e999`, which JSONB refuses;
    it also raises `RecursionError` on deep nesting and `UnicodeDecodeError` on
    bytes that are not UTF-8. Each of these is the client's mistake, so each is
    an `ArchiveRefused`, never a 500.
    """
    try:
        text = body.decode("utf-8")
        if "\\u0000" in text or "\x00" in text:
            raise ArchiveRefused("Archive illisible : caractère nul refusé.")
        raw = json.loads(text, parse_constant=_refuse_constant, parse_float=_finite)
    except ArchiveRefused:
        raise
    except (ValueError, RecursionError) as error:
        raise ArchiveRefused("Archive illisible : ce n'est pas du JSON valide.") from error
    return read_archive(raw)


def read_archive(raw: Any) -> RunArchive:
    """Validate an uploaded archive, migrating it first if it is older."""
    if not isinstance(raw, dict) or raw.get("format") != FORMAT:
        raise ArchiveRefused(f"Ce n'est pas une archive de run (format « {FORMAT} » attendu).")
    version = raw.get("version")
    while type(version) is int and version in MIGRATIONS:
        raw = MIGRATIONS[version](raw)
        version = raw.get("version")
    # `type(...) is int`: `True == 1` and `1.0 == 1`, and neither is a version.
    if type(version) is not int or version != VERSION:
        raise ArchiveRefused(
            f"Archive en version {version} : ce service lit la version {VERSION} seulement."
        )
    try:
        archive = RunArchive.model_validate(raw)
    except ValidationError as error:
        first = error.errors()[0]
        where = ".".join(str(part) for part in first["loc"])
        raise ArchiveRefused(f"Archive illisible ({where} : {first['msg']}).") from error
    # The title is shown in every run list: bounded like the index bounds it.
    archive.run.title = title_of(archive.run.title)
    return archive


#: The one event field that names the server's thread.
THREAD_KEY = "threadId"


def _without_thread(event: RunEvent) -> RunEvent:
    if event.kind != RunEventKind.RUN_STARTED or THREAD_KEY not in event.data:
        return event
    data = {key: value for key, value in event.data.items() if key != THREAD_KEY}
    return event.model_copy(update={"data": data})


def turns_of(archive: RunArchive, thread_id: str) -> list[RunTurn]:
    """The archive's turns, as the run `thread_id` records them."""

    def recorded(event: RunEvent) -> dict[str, Any]:
        payload = event.model_dump(mode="json")
        if event.kind == RunEventKind.RUN_STARTED:
            # The copy's own id wins over whatever the archive wrote there.
            payload["data"] = {**payload["data"], THREAD_KEY: thread_id}
        return payload

    return [
        RunTurn(
            brief=turn.brief,
            answer=turn.answer,
            events=[recorded(event) for event in turn.events],
        )
        for turn in archive.run.turns
    ]
