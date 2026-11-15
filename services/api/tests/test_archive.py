"""Exporter puis importer un run (MEM-26).

Ce que ces tests protègent : une archive rejouée rend le même modèle de lecture
que le run d'origine, sans rappeler le modèle ; une version inconnue est
refusée avec un message clair ; l'archive ne porte que les champs listés, et
le schéma publié dans `docs/` est celui que le code valide.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from test_fork import CountingPlanner, CountingSpecialist, chat

from usine_api.app import create_app
from usine_api.archive import RunArchive

SCHEMA = Path(__file__).resolve().parents[3] / "docs" / "schemas" / "run-archive.v1.json"

#: Every field an archive may carry. Adding one is a privacy decision: it goes
#: here, in the schema, and in the review of the exported fields.
EXPORTED_FIELDS = {
    "format",
    "version",
    "run",
    "run.title",
    "run.status",
    "run.specialist",
    "run.turns",
    "run.turns.brief",
    "run.turns.answer",
    "run.turns.events",
}


def read_model(run: dict[str, Any]) -> dict[str, Any]:
    """What the screen is built from, without what is the server's own.

    `run-started` names its own thread: the copy names the copy, which is the
    one difference a read model is allowed to have.
    """
    model = json.loads(
        json.dumps({key: run[key] for key in ("title", "status", "turns", "specialist", "history")})
    )
    for turn in model["history"]:
        for event in turn["events"]:
            if event["kind"] == "run-started":
                assert event["data"].pop("threadId") == run["thread_id"]
    return model


def make_client() -> tuple[TestClient, CountingPlanner]:
    planner = CountingPlanner()
    return TestClient(create_app(planner=planner, specialist=CountingSpecialist())), planner


def test_exporting_then_importing_gives_the_same_read_model() -> None:
    client, planner = make_client()
    with client:
        chat(client, "un brief à archiver", "chat-a")
        original = client.get("/api/runs/chat-a").json()

        exported = client.get("/api/runs/chat-a/export")
        assert exported.status_code == 200
        assert exported.headers["cache-control"] == "no-store"
        assert "attachment" in exported.headers["content-disposition"]
        archive = exported.json()
        assert archive["format"] == "usine.run"
        assert archive["version"] == 1

        calls = planner.calls
        imported = client.post("/api/runs/import", json=archive)
        assert imported.status_code == 201
        copy = imported.json()

        assert copy["thread_id"] != "chat-a"
        assert read_model(copy) == read_model(original)
        assert read_model(client.get(f"/api/runs/{copy['thread_id']}").json()) == read_model(
            original
        )
        # Replay: the archive is read back, the model is not called again.
        assert planner.calls == calls


def test_an_archive_of_an_unknown_version_is_refused_clearly() -> None:
    client, _ = make_client()
    with client:
        chat(client, "un brief", "chat-v")
        archive = client.get("/api/runs/chat-v/export").json()
        archive["version"] = 99

        reply = client.post("/api/runs/import", json=archive)
        assert reply.status_code == 422
        assert "version 99" in reply.json()["detail"]
        assert "version 1" in reply.json()["detail"]


def test_an_archive_that_is_not_one_is_refused() -> None:
    client, _ = make_client()
    with client:
        assert client.post("/api/runs/import", json={"hello": "world"}).status_code == 422
        bad_event = {
            "format": "usine.run",
            "version": 1,
            "run": {
                "title": "t",
                "status": "done",
                "turns": [{"brief": "b", "answer": "a", "events": [{"kind": "not-a-kind"}]}],
            },
        }
        assert client.post("/api/runs/import", json=bad_event).status_code == 422


def test_an_unfinished_run_is_not_exported() -> None:
    from usine_api.threads import InMemoryThreadIndex

    index = InMemoryThreadIndex()
    index.start("chat-r", None, "en cours")
    with TestClient(
        create_app(planner=CountingPlanner(), specialist=CountingSpecialist(), threads=index)
    ) as c:
        reply = c.get("/api/runs/chat-r/export")
        assert reply.status_code == 409
        assert c.get("/api/runs/nope/export").status_code == 404


def fields_of(value: Any, prefix: str = "") -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        for key, inner in value.items():
            if prefix.endswith("events"):
                continue
            name = f"{prefix}.{key}" if prefix else key
            found.add(name)
            found |= fields_of(inner, name)
    elif isinstance(value, list):
        for item in value:
            found |= fields_of(item, prefix)
    return found


def test_the_archive_carries_only_the_reviewed_fields() -> None:
    client, _ = make_client()
    with client:
        chat(client, "un brief", "chat-p")
        archive = client.get("/api/runs/chat-p/export").json()
    assert fields_of(archive) <= EXPORTED_FIELDS
    # Never the server's identifiers, dates or owner.
    text = json.dumps(archive)
    for forbidden in ("chat-p", "thread_id", "created_at", "owner", "user_id"):
        assert forbidden not in text


def test_the_published_schema_is_the_one_the_code_validates() -> None:
    body = (
        json.dumps(RunArchive.model_json_schema(), indent=2, ensure_ascii=False, sort_keys=True)
        + "\n"
    )
    if os.environ.get("USINE_REGEN_FIXTURES") == "1":
        SCHEMA.parent.mkdir(parents=True, exist_ok=True)
        SCHEMA.write_text(body, encoding="utf-8")
    assert SCHEMA.exists() and body == SCHEMA.read_text(encoding="utf-8"), (
        "docs/schemas/run-archive.v1.json is stale: USINE_REGEN_FIXTURES=1 pnpm test:api"
    )


DSN = os.environ.get("USINE_TEST_DATABASE_URL", "")


@pytest.mark.skipif(not DSN, reason="USINE_TEST_DATABASE_URL is not set")
def test_on_postgres_a_restored_run_reads_back_and_never_overwrites() -> None:
    import uuid

    from psycopg_pool import ConnectionPool

    from usine_api.db import migrate
    from usine_api.threads import PostgresThreadIndex, RunTurn

    pool = ConnectionPool(DSN, open=True)
    try:
        migrate(pool)
        index = PostgresThreadIndex(pool)
        thread = f"pg-a-{uuid.uuid4().hex}"
        turns = [RunTurn(brief="b", answer="a", events=[{"kind": "run-finished", "at": 1.0}])]
        assert index.restore(thread, "org", "titre", "done", "pydantic-ai", turns)
        assert not index.restore(thread, "org", "autre", "done", None, [])
        detail = index.get(thread, "org")
        assert detail is not None
        assert (detail.title, detail.status, detail.specialist) == ("titre", "done", "pydantic-ai")
        assert detail.history == turns
        assert index.get(thread, "another-org") is None
    finally:
        pool.close()
