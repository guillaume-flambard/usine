"""Les runs stockés et relus.

Ce que ces tests protègent : un lien partagé doit rouvrir exactement le run
qu'on a poussé, et un run fabriqué à la main ne doit pas entrer sans être
compris.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.identity import RecordingEmailSender
from usine_api.runs import ARCHIVE_VERSION, InMemoryRunStore


def event(sequence: int, kind: str = "message-emitted", **extra: Any) -> dict[str, Any]:
    return {"type": kind, "sequence": sequence, **extra}


def archive(*events: dict[str, Any], brief: str = "un besoin") -> dict[str, Any]:
    return {"version": ARCHIVE_VERSION, "brief": brief, "events": list(events)}


def make_app(**kwargs: Any) -> tuple[FastAPI, RecordingEmailSender]:
    mailer = RecordingEmailSender()
    app = create_app(key="clé", call=None, email=mailer, secure_cookies=False, **kwargs)
    return app, mailer


def sign_in(client: TestClient, mailer: RecordingEmailSender, email: str) -> None:
    """Connecte ce client (lien magique) : son bocal à cookies porte la session."""
    client.post("/auth/request-link", json={"email": email})
    _addr, link = mailer.sent[-1]
    token = link.split("token=", 1)[1]
    client.get("/auth/redeem", params={"token": token}, follow_redirects=False)


def client_for(**kwargs: Any) -> TestClient:
    """Un client déjà connecté : la plupart des tests conservent puis relisent
    leurs propres runs, donc propriétaire == lecteur."""
    app, mailer = make_app(**kwargs)
    client = TestClient(app)
    sign_in(client, mailer, "owner@atelier.co")
    return client


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


# --- Tenancy : appartenance, privé par défaut, partage, isolation entre orgs. ---


def test_storing_a_run_requires_sign_in() -> None:
    app, _mailer = make_app()
    anonymous = TestClient(app)
    assert anonymous.post("/runs", json=archive(event(1))).status_code == 401


def test_a_run_is_private_by_default() -> None:
    app, mailer = make_app()
    owner = TestClient(app)
    sign_in(owner, mailer, "owner@atelier.co")
    run_id = owner.post("/runs", json=archive(event(1))).json()["id"]

    # Un visiteur anonyme ne voit pas un run non partagé : 404, pas 403.
    assert TestClient(app).get(f"/runs/{run_id}").status_code == 404


def test_another_org_cannot_read_a_run() -> None:
    app, mailer = make_app()
    owner = TestClient(app)
    sign_in(owner, mailer, "owner@atelier.co")
    run_id = owner.post("/runs", json=archive(event(1))).json()["id"]

    other = TestClient(app)
    sign_in(other, mailer, "someone-else@atelier.co")
    # Indistinct d'un run inexistant : on ne fuite pas l'existence.
    assert other.get(f"/runs/{run_id}").status_code == 404


def test_sharing_enables_the_link_and_revoking_disables_it() -> None:
    app, mailer = make_app()
    owner = TestClient(app)
    sign_in(owner, mailer, "owner@atelier.co")
    run_id = owner.post("/runs", json=archive(event(1))).json()["id"]
    anonymous = TestClient(app)

    assert anonymous.get(f"/runs/{run_id}").status_code == 404
    assert owner.post(f"/runs/{run_id}/share").status_code == 200
    assert anonymous.get(f"/runs/{run_id}").status_code == 200
    assert owner.post(f"/runs/{run_id}/revoke").status_code == 200
    assert anonymous.get(f"/runs/{run_id}").status_code == 404


def test_a_non_owner_cannot_administer_a_run() -> None:
    app, mailer = make_app()
    owner = TestClient(app)
    sign_in(owner, mailer, "owner@atelier.co")
    run_id = owner.post("/runs", json=archive(event(1))).json()["id"]

    other = TestClient(app)
    sign_in(other, mailer, "someone-else@atelier.co")
    assert other.post(f"/runs/{run_id}/share").status_code == 404
    assert other.delete(f"/runs/{run_id}").status_code == 404
    # Le propriétaire, lui, peut supprimer.
    assert owner.delete(f"/runs/{run_id}").status_code == 200
    assert owner.get(f"/runs/{run_id}").status_code == 404


def test_listing_returns_only_ones_own_runs() -> None:
    app, mailer = make_app()
    owner = TestClient(app)
    sign_in(owner, mailer, "owner@atelier.co")
    owner.post("/runs", json=archive(event(1)))
    owner.post("/runs", json=archive(event(1)))

    other = TestClient(app)
    sign_in(other, mailer, "someone-else@atelier.co")
    other.post("/runs", json=archive(event(1)))

    assert len(owner.get("/runs").json()["runs"]) == 2
    assert len(other.get("/runs").json()["runs"]) == 1


def test_stored_events_are_byte_for_byte_unchanged() -> None:
    client = client_for()
    pushed = archive(event(1), event(2, "work-finished"))
    run_id = client.post("/runs", json=pushed).json()["id"]
    assert client.get(f"/runs/{run_id}").json()["events"] == pushed["events"]
