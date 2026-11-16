"""Les adaptateurs PostgreSQL, contre une vraie base.

Sautés en CI (pas de base) : ces tests ne tournent que si `USINE_TEST_DATABASE_URL`
pointe vers un Postgres jetable. En local :

    docker run -d --name usine-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=usine \\
        -p 55432:5432 postgres:16-alpine
    USINE_TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/usine \\
        uv run --extra dev pytest tests/test_postgres.py

Ils prouvent que les impls Postgres tiennent le même contrat que celles en
mémoire (mêmes comportements que test_identity / test_runs).
"""

from __future__ import annotations

import os
import uuid
from contextlib import contextmanager
from typing import Any

import pytest

from usine_api.erasure import PostgresErasure, SequentialErasure
from usine_api.runs import Archive, Stored

DSN = os.environ.get("USINE_TEST_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(not DSN, reason="USINE_TEST_DATABASE_URL non défini")


@pytest.fixture
def stores():  # type: ignore[no-untyped-def]
    from usine_api.postgres import PostgresStores

    made = PostgresStores(DSN)
    with made.pool.connection() as conn:
        conn.execute(
            "TRUNCATE audit_entries, runs, sessions, magic_link_tokens, "
            "organizations, accounts CASCADE"
        )
    yield made
    made.pool.close()


def archive(*seqs: int) -> Archive:
    return Archive(
        version=1,
        brief="un besoin",
        events=[{"type": "message-emitted", "sequence": s} for s in seqs],
    )


def test_migrations_are_idempotent(stores) -> None:  # type: ignore[no-untyped-def]
    from usine_api.db import migrate

    # Déjà migré par le constructeur : un deuxième passage n'applique rien.
    assert migrate(stores.pool) == []


def test_identity_is_idempotent_by_email(stores) -> None:  # type: ignore[no-untyped-def]
    first = stores.identities.ensure("a@b.co")
    again = stores.identities.ensure("a@b.co")
    assert first.account.id == again.account.id
    assert first.organization.id == again.organization.id
    assert stores.identities.by_account(first.account.id) == first


def test_token_is_single_use_and_hashed(stores) -> None:  # type: ignore[no-untyped-def]
    token = stores.tokens.issue("a@b.co")
    assert stores.tokens.redeem(token) == "a@b.co"
    assert stores.tokens.redeem(token) is None
    # Stocké en hash : le clair n'apparaît nulle part.
    with stores.pool.connection() as conn:
        rows = conn.execute("SELECT token_hash FROM magic_link_tokens").fetchall()
    assert all(token not in row[0] for row in rows)


def test_sessions_open_resolve_and_close(stores) -> None:  # type: ignore[no-untyped-def]
    # Une session vise un compte réel (contrainte de clé étrangère en base).
    account_id = stores.identities.ensure("a@b.co").account.id
    sid = stores.sessions.open(account_id)
    assert stores.sessions.account(sid) == account_id
    stores.sessions.close(sid)
    assert stores.sessions.account(sid) is None


def test_runs_are_owned_private_and_shareable(stores) -> None:  # type: ignore[no-untyped-def]
    stores.runs.create("r1", archive(1, 2), "orgA")
    # Le propriétaire lit ; une autre org non ; anonyme non plus.
    assert stores.runs.get("r1", "orgA") is not None
    assert stores.runs.get("r1", "orgB") is None
    assert stores.runs.get("r1", None) is None
    # Partagé : le lien s'ouvre pour tous ; révoqué : il se referme.
    assert stores.runs.share("r1", "orgA") is True
    assert stores.runs.get("r1", None) is not None
    assert stores.runs.revoke("r1", "orgA") is True
    assert stores.runs.get("r1", None) is None
    # Un non-propriétaire n'administre pas.
    assert stores.runs.share("r1", "orgB") is False
    assert stores.runs.delete("r1", "orgB") is False
    assert stores.runs.delete("r1", "orgA") is True
    assert stores.runs.get("r1", "orgA") is None


def test_events_survive_the_round_trip(stores) -> None:  # type: ignore[no-untyped-def]
    stores.runs.create("r2", archive(3, 1, 2), "orgA")
    got = stores.runs.get("r2", "orgA")
    assert got is not None
    assert [e["sequence"] for e in got.events] == [3, 1, 2]


def test_listing_returns_only_ones_own(stores) -> None:  # type: ignore[no-untyped-def]
    stores.runs.create("r1", archive(1), "orgA")
    stores.runs.create("r2", archive(1), "orgA")
    stores.runs.create("r3", archive(1), "orgB")
    assert len(stores.runs.list_for("orgA")) == 2
    assert len(stores.runs.list_for("orgB")) == 1


def test_lifecycle_trash_restore_purge(stores) -> None:  # type: ignore[no-untyped-def]
    stores.runs.create("r1", archive(1), "orgA")
    stores.runs.share("r1", "orgA")
    # Corbeille : invisible, y compris par lien partagé, mais retenu.
    assert stores.runs.delete("r1", "orgA") is True
    assert stores.runs.get("r1", "orgA") is None
    assert stores.runs.get("r1", None) is None
    assert stores.runs.list_for("orgA") == []
    assert [rid for rid, _ in stores.runs.list_trashed("orgA")] == ["r1"]
    # Restauré : de retour (et non partagé — le partage a été perdu à la corbeille ?
    # non : on ne touche pas `shared`, mais le run est de nouveau lisible).
    assert stores.runs.restore("r1", "orgA") is True
    assert stores.runs.get("r1", "orgA") is not None
    # Purge : un run vivant ne se purge pas ; en corbeille, oui, propriétaire seul.
    assert stores.runs.purge("r1", "orgA") is False
    stores.runs.delete("r1", "orgA")
    assert stores.runs.purge("r1", "orgB") is False
    assert stores.runs.purge("r1", "orgA") is True
    assert stores.runs.list_trashed("orgA") == []


def test_purge_expired_on_postgres(stores) -> None:  # type: ignore[no-untyped-def]
    stores.runs.create("r1", archive(1), "orgA")
    stores.runs.delete("r1", "orgA")
    # Fenêtre large : rien ne part (corbeille toute récente).
    assert stores.runs.purge_expired(older_than_seconds=3600) == 0
    # Fenêtre nulle : tout ce qui est en corbeille part.
    assert stores.runs.purge_expired(older_than_seconds=0) == 1
    assert stores.runs.list_trashed("orgA") == []


def test_audit_records_and_isolates_by_org(stores) -> None:  # type: ignore[no-untyped-def]
    stores.audit.record("orgA", "share", "r1")
    stores.audit.record("orgA", "trash", "r1")
    stores.audit.record("orgB", "purge", "r9")
    a = [(e.action, e.target) for e in stores.audit.entries("orgA")]
    assert a == [("share", "r1"), ("trash", "r1")]
    # Une org ne voit pas le journal d'une autre.
    assert [e.target for e in stores.audit.entries("orgB")] == ["r9"]


def test_erasure_across_stores_on_postgres(stores) -> None:  # type: ignore[no-untyped-def]
    who = stores.identities.ensure("leaver@b.co")
    org = who.organization.id
    keeper = stores.identities.ensure("keeper@b.co")
    stores.runs.create("r1", archive(1), org)
    stores.runs.create("k1", archive(1), keeper.organization.id)
    sid = stores.sessions.open(who.account.id)
    stores.tokens.issue("leaver@b.co")
    stores.audit.record(org, "share", "r1")

    # Effacement, dans l'ordre des clés étrangères (comme la route).
    assert stores.sessions.forget(who.account.id) == 1
    assert stores.runs.forget_owner(org) == 1
    assert stores.tokens.forget("leaver@b.co") == 1
    assert stores.audit.forget(org) == 1
    assert stores.identities.forget(who.account.id) is True

    # Parti pour la personne, intact pour l'autre.
    assert stores.identities.by_account(who.account.id) is None
    assert stores.sessions.account(sid) is None
    assert stores.runs.get("k1", keeper.organization.id) is not None
    assert stores.identities.by_account(keeper.account.id) is not None


def test_credential_purge_on_postgres(stores) -> None:  # type: ignore[no-untyped-def]
    # Jeton et session avec TTL nul : expirés d'emblée, donc purgés.
    from usine_api.postgres import PostgresSessionStore, PostgresTokenStore

    who = stores.identities.ensure("a@b.co")
    PostgresTokenStore(stores.pool, ttl_seconds=0).issue("a@b.co")
    PostgresSessionStore(stores.pool, ttl_seconds=0).open(who.account.id)
    assert stores.tokens.purge_expired() == 1
    assert stores.sessions.purge_expired() == 1


def test_full_flow_through_the_app_on_postgres(stores, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    # Prouve que create_app câble bien Postgres depuis DATABASE_URL, et que le
    # flux connexion → conservation → relecture tient de bout en bout sur la base.
    from fastapi.testclient import TestClient

    from usine_api.app import create_app
    from usine_api.identity import RecordingEmailSender

    monkeypatch.setenv("DATABASE_URL", DSN)
    mailer = RecordingEmailSender()
    app = create_app(key="clé", call=None, email=mailer, secure_cookies=False)

    # En contexte : le lifespan ferme le pool à la sortie (pas de fuite).
    with TestClient(app) as signed_in:
        signed_in.post("/auth/request-link", json={"email": "a@b.co"})
        token = mailer.sent[-1][1].split("token=", 1)[1]
        signed_in.get("/auth/redeem", params={"token": token}, follow_redirects=False)

        run = {"version": 1, "brief": "x", "events": [{"type": "work-finished", "sequence": 1}]}
        run_id = signed_in.post("/runs", json=run).json()["id"]
        assert signed_in.get(f"/runs/{run_id}").status_code == 200
        # Un visiteur anonyme ne voit pas ce run privé.
        assert TestClient(app).get(f"/runs/{run_id}").status_code == 404


def test_creating_a_run_twice_under_the_same_id_is_refused(stores) -> None:  # type: ignore[no-untyped-def]
    # Le jumeau de test_runs.py : même entrée, même refus, même code. Avant, la
    # contrainte d'unicité sortait en UniqueViolation, donc en 500, quand la
    # version en mémoire écrasait sans rien dire.
    stores.runs.create("r1", archive(1), "orgA")
    stores.runs.share("r1", "orgA")

    with pytest.raises(Stored) as refused:
        stores.runs.create("r1", archive(9), "orgA")
    assert refused.value.status == 409

    # Intact, et le pool reste utilisable après l'échec (la transaction est
    # défaite en sortant du bloc, la connexion retourne saine au pool).
    kept = stores.runs.get("r1", None)
    assert kept is not None
    assert [e["sequence"] for e in kept.events] == [1]


class _ConnFailingAt:
    """La vraie connexion, mais dont le Nième `execute` lève, en comptant à
    travers TOUTES les connexions empruntées au pool.

    C'est le seul moyen de prouver la promesse. Attention au piège rencontré en
    l'écrivant : retirer `conn.transaction()` ne suffit PAS à casser
    l'atomicité, parce que `pool.connection()` défait déjà tout en sortant sur
    une exception. Ce qui la casse, c'est d'emprunter **cinq** connexions au
    lieu d'une — chacune valide ce qu'elle a fait avant que la suivante
    n'échoue. D'où le test ci-dessous, qui oppose les deux implémentations sur
    les mêmes données plutôt que de bricoler la nouvelle.
    """

    def __init__(self, conn: Any, state: dict[str, int]) -> None:
        self._conn = conn
        self._state = state

    def transaction(self) -> Any:
        return self._conn.transaction()

    def execute(self, *args: Any, **kwargs: Any) -> Any:
        self._state["seen"] += 1
        if self._state["seen"] == self._state["fail_on"]:
            raise RuntimeError("panne au milieu de l'effacement")
        return self._conn.execute(*args, **kwargs)


class _PoolFailingAt:
    def __init__(self, pool: Any, fail_on: int) -> None:
        self._pool = pool
        # Partagé entre connexions : la cascade séquentielle en emprunte cinq.
        self._state = {"seen": 0, "fail_on": fail_on}

    @contextmanager
    def connection(self) -> Any:
        with self._pool.connection() as conn:
            yield _ConnFailingAt(conn, self._state)


def _sessions_of(stores: Any, account_id: str) -> list[str]:
    with stores.pool.connection() as conn:
        rows = conn.execute(
            "SELECT session_id FROM sessions WHERE account_id = %s", (account_id,)
        ).fetchall()
    return [row[0] for row in rows]


def _someone(stores: Any) -> tuple[str, str]:
    """Un compte avec un run, une session, un jeton et une entrée d'audit."""
    identity = stores.identities.ensure("a@b.co")
    account_id, org = identity.account.id, identity.organization.id
    stores.runs.create("r1", archive(1), org)
    stores.sessions.open(account_id)
    stores.tokens.issue("a@b.co")
    stores.audit.record(org, "share", "r1")
    return account_id, org


def test_the_sequential_cascade_leaves_a_half_erased_account(stores) -> None:  # type: ignore[no-untyped-def]
    # Ce que faisait la route avant : cinq ports, donc cinq connexions, donc
    # cinq transactions. C'est le défaut que la version transactionnelle ferme,
    # et ce test le garde visible plutôt que de le raconter.
    from usine_api.postgres import (
        PostgresAuditLog,
        PostgresIdentityStore,
        PostgresRunStore,
        PostgresSessionStore,
        PostgresTokenStore,
    )

    account_id, org = _someone(stores)
    failing_pool = _PoolFailingAt(stores.pool, 4)
    sequential = SequentialErasure(
        runs=PostgresRunStore(failing_pool),
        identities=PostgresIdentityStore(failing_pool),
        tokens=PostgresTokenStore(failing_pool),
        sessions=PostgresSessionStore(failing_pool),
        audit=PostgresAuditLog(failing_pool),
    )

    with pytest.raises(RuntimeError):
        sequential.erase(account_id=account_id, org=org, email="a@b.co")

    # La panne tombe sur le 4e DELETE : les trois premiers sont déjà validés.
    assert stores.runs.get("r1", org) is None
    assert _sessions_of(stores, account_id) == []
    # Et le compte, lui, est toujours là : à moitié effacé.
    assert stores.identities.by_account(account_id) is not None


def test_erasure_is_all_or_nothing(stores) -> None:  # type: ignore[no-untyped-def]
    # La même panne, au même endroit, sur la version transactionnelle.
    account_id, org = _someone(stores)

    failing = PostgresErasure(_PoolFailingAt(stores.pool, 4))
    with pytest.raises(RuntimeError):
        failing.erase(account_id=account_id, org=org, email="a@b.co")

    # Rien n'est parti : une seule connexion, donc une seule transaction.
    assert stores.runs.get("r1", org) is not None
    assert stores.identities.by_account(account_id) is not None
    assert stores.audit.entries(org) != []
    assert _sessions_of(stores, account_id) != []


def test_erasure_through_the_app_leaves_nothing(stores) -> None:  # type: ignore[no-untyped-def]
    # Le chemin nominal, sur la vraie base : ce que la transaction efface quand
    # rien ne tombe en panne.
    identity = stores.identities.ensure("a@b.co")
    account_id, org = identity.account.id, identity.organization.id
    stores.runs.create("r1", archive(1), org)
    stores.audit.record(org, "share", "r1")

    stores.erasure.erase(account_id=account_id, org=org, email="a@b.co")

    assert stores.runs.get("r1", org) is None
    assert stores.identities.by_account(account_id) is None
    assert stores.audit.entries(org) == []
    assert _sessions_of(stores, account_id) == []


def test_abandoning_running_threads_on_postgres(stores) -> None:  # type: ignore[no-untyped-def]
    from usine_api.threads import RunTurn

    suffix = uuid.uuid4().hex[:8]
    cut, gate = f"cut-{suffix}", f"gate-{suffix}"
    stores.threads.start(cut, None, "coupé")
    stores.threads.start(gate, None, "à la porte")
    stores.threads.finish(gate, RunTurn(brief="à la porte", answer="", events=[]), "waiting")

    assert stores.threads.abandon_running() >= 1
    assert stores.threads.get(cut, None).status == "error"
    assert stores.threads.get(gate, None).status == "waiting"
