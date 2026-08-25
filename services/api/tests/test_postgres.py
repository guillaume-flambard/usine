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

import pytest

from usine_api.runs import Archive

DSN = os.environ.get("USINE_TEST_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(not DSN, reason="USINE_TEST_DATABASE_URL non défini")


@pytest.fixture
def stores():  # type: ignore[no-untyped-def]
    from usine_api.postgres import PostgresStores

    made = PostgresStores(DSN)
    with made.pool.connection() as conn:
        conn.execute("TRUNCATE runs, sessions, magic_link_tokens, organizations, accounts CASCADE")
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
    stores.runs.put("r1", archive(1, 2), "orgA")
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
    stores.runs.put("r2", archive(3, 1, 2), "orgA")
    got = stores.runs.get("r2", "orgA")
    assert got is not None
    assert [e["sequence"] for e in got.events] == [3, 1, 2]


def test_listing_returns_only_ones_own(stores) -> None:  # type: ignore[no-untyped-def]
    stores.runs.put("r1", archive(1), "orgA")
    stores.runs.put("r2", archive(1), "orgA")
    stores.runs.put("r3", archive(1), "orgB")
    assert len(stores.runs.list_for("orgA")) == 2
    assert len(stores.runs.list_for("orgB")) == 1


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
