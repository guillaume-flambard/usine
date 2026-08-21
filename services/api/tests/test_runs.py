"""Les runs stockés et relus.

Ce que ces tests protègent : un lien partagé doit rouvrir exactement le run
qu'on a poussé, et un run fabriqué à la main ne doit pas entrer sans être
compris.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.runs import ARCHIVE_VERSION, InMemoryRunStore


def event(sequence: int, kind: str = "message-emitted", **extra: Any) -> dict[str, Any]:
    return {"type": kind, "sequence": sequence, **extra}


def archive(*events: dict[str, Any], brief: str = "un besoin") -> dict[str, Any]:
    return {"version": ARCHIVE_VERSION, "brief": brief, "events": list(events)}


def client_for(**kwargs: Any) -> TestClient:
    return TestClient(create_app(key="clé", call=None, **kwargs))


def test_a_pushed_run_comes_back_identical() -> None:
    client = client_for()
    pushed = archive(event(1), event(2, "work-finished"))

    created = client.post("/runs", json=pushed)
    assert created.status_code == 201
    run_id = created.json()["id"]

    fetched = client.get(f"/runs/{run_id}").json()

    assert fetched == pushed


def test_the_identifier_is_not_guessable() -> None:
    client = client_for()

    first = client.post("/runs", json=archive(event(1))).json()["id"]
    second = client.post("/runs", json=archive(event(1))).json()["id"]

    assert first != second
    assert len(first) > 8


def test_an_unknown_run_is_a_404_not_an_empty_page() -> None:
    assert client_for().get("/runs/jamais-vu").status_code == 404


def test_events_are_stored_in_sequence_order() -> None:
    # Un fichier réordonné à la main ne doit pas produire un graphe incohérent
    # chez celui qui ouvrira le lien.
    client = client_for()
    run_id = client.post("/runs", json=archive(event(3), event(1), event(2))).json()["id"]

    fetched = client.get(f"/runs/{run_id}").json()

    assert [e["sequence"] for e in fetched["events"]] == [1, 2, 3]


def test_a_run_of_another_version_is_refused_rather_than_guessed() -> None:
    client = client_for()

    response = client.post("/runs", json={"version": 99, "brief": "", "events": [event(1)]})

    assert response.status_code == 400
    assert "version" in response.json()["error"]


def test_a_run_with_no_event_is_not_a_run() -> None:
    client = client_for()

    assert client.post("/runs", json=archive()).status_code == 400
    assert client.post("/runs", json={"version": ARCHIVE_VERSION}).status_code == 400


def test_malformed_events_are_dropped_rather_than_stored() -> None:
    client = client_for()
    run_id = client.post("/runs", json=archive(event(1), {"pas": "un événement"}, event(2))).json()[
        "id"
    ]

    fetched = client.get(f"/runs/{run_id}").json()

    assert len(fetched["events"]) == 2


def test_the_store_does_not_grow_without_bound() -> None:
    # Un stockage sans borne sur un service public est une fuite de mémoire
    # avec un nom flatteur.
    store = InMemoryRunStore(capacity=3)
    client = client_for(runs=store)

    ids = [client.post("/runs", json=archive(event(1))).json()["id"] for _ in range(5)]

    assert store.count() == 3
    assert client.get(f"/runs/{ids[0]}").status_code == 404
    assert client.get(f"/runs/{ids[-1]}").status_code == 200


def test_a_stored_run_is_never_cached() -> None:
    client = client_for()
    run_id = client.post("/runs", json=archive(event(1))).json()["id"]

    assert client.get(f"/runs/{run_id}").headers["cache-control"] == "no-store"
