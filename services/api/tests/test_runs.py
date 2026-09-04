"""Les runs stockés et relus.

Ce que ces tests protègent : un lien partagé doit rouvrir exactement le run
qu'on a poussé, et un run fabriqué à la main ne doit pas entrer sans être
compris.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.identity import RecordingEmailSender
from usine_api.runs import ARCHIVE_VERSION, Archive, InMemoryRunStore, Stored

# Une archive prête pour les tests du store directement (hors HTTP).
ARCHIVE_IM = Archive(
    version=1, brief="un besoin", events=[{"type": "work-finished", "sequence": 1}]
)


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


# --- Cycle de vie : corbeille réversible, restauration, purge. ---


def test_delete_trashes_a_run_reversibly() -> None:
    store = InMemoryRunStore()
    store.create("r1", ARCHIVE_IM, "orgA")
    assert store.delete("r1", "orgA") is True
    # Invisible : ni listé, ni résolu — mais retenu.
    assert store.get("r1", "orgA") is None
    assert store.list_for("orgA") == []
    assert [rid for rid, _ in store.list_trashed("orgA")] == ["r1"]
    # Restauré : de retour.
    assert store.restore("r1", "orgA") is True
    assert store.get("r1", "orgA") is not None
    assert store.list_trashed("orgA") == []


def test_a_trashed_shared_run_stops_resolving() -> None:
    store = InMemoryRunStore()
    store.create("r1", ARCHIVE_IM, "orgA")
    store.share("r1", "orgA")
    assert store.get("r1", None) is not None
    store.delete("r1", "orgA")
    # Même partagé, un run en corbeille ne résout plus.
    assert store.get("r1", None) is None


def test_only_the_owner_administers_lifecycle() -> None:
    store = InMemoryRunStore()
    store.create("r1", ARCHIVE_IM, "orgA")
    assert store.delete("r1", "orgB") is False
    store.delete("r1", "orgA")
    assert store.restore("r1", "orgB") is False
    assert store.purge("r1", "orgB") is False
    assert store.purge("r1", "orgA") is True
    assert store.get("r1", "orgA") is None
    assert store.list_trashed("orgA") == []


def test_purge_only_removes_a_trashed_run() -> None:
    store = InMemoryRunStore()
    store.create("r1", ARCHIVE_IM, "orgA")
    # Un run vivant ne se purge pas : ça contournerait la corbeille.
    assert store.purge("r1", "orgA") is False
    store.delete("r1", "orgA")
    assert store.purge("r1", "orgA") is True


# --- Le contrat de `create` : un id est pris une fois, et les deux impls le
# disent pareil. C'est ce que ces deux tests tiennent, avec leurs jumeaux dans
# test_postgres.py. ---


def test_creating_a_run_twice_under_the_same_id_is_refused() -> None:
    # Le défaut que ça ferme : l'entrée entière était réécrite, donc un run
    # repoussé sous le même id repartait non partagé. Postgres, lui, refusait
    # déjà l'insertion, mais en 500. Un port dont les deux implémentations ne
    # répondent pas la même chose à la même entrée n'est pas un port.
    store = InMemoryRunStore()
    store.create("r1", ARCHIVE_IM, "orgA")
    store.share("r1", "orgA")

    autre = Archive(version=1, brief="autre", events=[{"type": "work-finished", "sequence": 9}])
    with pytest.raises(Stored) as refuse:
        store.create("r1", autre, "orgA")
    assert refuse.value.status == 409

    # Intact : mêmes événements, et toujours partagé.
    assert store.get("r1", None) == ARCHIVE_IM


def test_a_refused_creation_does_not_resurrect_a_trashed_run() -> None:
    store = InMemoryRunStore()
    store.create("r1", ARCHIVE_IM, "orgA")
    store.delete("r1", "orgA")

    with pytest.raises(Stored):
        store.create("r1", ARCHIVE_IM, "orgA")

    # Toujours en corbeille : une collision ne ressuscite rien.
    assert store.get("r1", "orgA") is None
    assert [rid for rid, _ in store.list_trashed("orgA")] == ["r1"]


def test_delete_route_trashes_and_restore_route_brings_back() -> None:
    app, mailer = make_app()
    owner = TestClient(app)
    sign_in(owner, mailer, "owner@atelier.co")
    run_id = owner.post("/runs", json=archive(event(1))).json()["id"]

    assert owner.delete(f"/runs/{run_id}").json() == {"trashed": True}
    # Disparu des vivants et de la lecture, présent dans la corbeille.
    assert owner.get(f"/runs/{run_id}").status_code == 404
    assert owner.get("/runs").json()["runs"] == []
    trashed = owner.get("/runs", params={"trashed": "1"}).json()["runs"]
    assert [r["id"] for r in trashed] == [run_id]

    assert owner.post(f"/runs/{run_id}/restore").json() == {"restored": True}
    assert owner.get(f"/runs/{run_id}").status_code == 200
    assert len(owner.get("/runs").json()["runs"]) == 1


def test_purge_route_removes_a_trashed_run() -> None:
    app, mailer = make_app()
    owner = TestClient(app)
    sign_in(owner, mailer, "owner@atelier.co")
    run_id = owner.post("/runs", json=archive(event(1))).json()["id"]
    # On ne purge pas un run vivant.
    assert owner.post(f"/runs/{run_id}/purge").status_code == 404
    owner.delete(f"/runs/{run_id}")
    assert owner.post(f"/runs/{run_id}/purge").json() == {"purged": True}
    assert owner.get("/runs", params={"trashed": "1"}).json()["runs"] == []


def test_export_route_is_owner_only_and_attaches() -> None:
    app, mailer = make_app()
    owner = TestClient(app)
    sign_in(owner, mailer, "owner@atelier.co")
    pushed = archive(event(1), event(2, "work-finished"))
    run_id = owner.post("/runs", json=pushed).json()["id"]

    exported = owner.get(f"/runs/{run_id}/export")
    assert exported.status_code == 200
    assert "attachment" in exported.headers["content-disposition"]
    assert exported.json()["events"] == pushed["events"]

    # Même partagé, une autre org ne l'exporte pas.
    owner.post(f"/runs/{run_id}/share")
    other = TestClient(app)
    sign_in(other, mailer, "someone-else@atelier.co")
    assert other.get(f"/runs/{run_id}/export").status_code == 404


def test_purge_expired_removes_only_long_trashed_runs() -> None:
    clock = {"t": 1000.0}
    store = InMemoryRunStore(now=lambda: clock["t"])
    store.create("old", ARCHIVE_IM, "orgA")
    store.create("recent", ARCHIVE_IM, "orgA")
    store.create("live", ARCHIVE_IM, "orgA")
    store.delete("old", "orgA")
    clock["t"] += 100
    store.delete("recent", "orgA")
    # Fenêtre de 50 s : « old » (corbeille depuis 100 s) part, « recent » (0 s)
    # et « live » restent.
    removed = store.purge_expired(older_than_seconds=50)
    assert removed == 1
    assert store.get("live", "orgA") is not None
    assert [rid for rid, _ in store.list_trashed("orgA")] == ["recent"]
