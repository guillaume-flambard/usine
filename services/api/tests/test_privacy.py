"""Les droits des personnes : accès, portabilité, effacement, et la rétention."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.audit import InMemoryAuditLog
from usine_api.identity import (
    InMemorySessionStore,
    InMemoryTokenStore,
    RecordingEmailSender,
)
from usine_api.maintenance import run_purge
from usine_api.memory import InMemoryMemory
from usine_api.runs import Archive, InMemoryRunStore


def archive() -> dict[str, Any]:
    return {"version": 1, "brief": "x", "events": [{"type": "work-finished", "sequence": 1}]}


def build() -> tuple[TestClient, RecordingEmailSender]:
    mailer = RecordingEmailSender()
    app = create_app(key="clé", call=None, email=mailer, secure_cookies=False)
    return TestClient(app), mailer


def sign_in(client: TestClient, mailer: RecordingEmailSender, email: str) -> None:
    client.post("/auth/request-link", json={"email": email})
    token = mailer.sent[-1][1].split("token=", 1)[1]
    client.get("/auth/redeem", params={"token": token}, follow_redirects=False)


# --- Droit d'accès ---


def test_account_summary_reports_what_is_held() -> None:
    client, mailer = build()
    sign_in(client, mailer, "a@b.co")
    client.post("/runs", json=archive())
    body = client.get("/account").json()
    assert body["email"] == "a@b.co"
    assert body["runs"] == 1
    assert body["trashed"] == 0


def test_account_summary_requires_sign_in() -> None:
    client, _ = build()
    assert client.get("/account").status_code == 401


# --- Droit à la portabilité ---


def test_export_bundles_all_of_ones_runs() -> None:
    client, mailer = build()
    sign_in(client, mailer, "a@b.co")
    client.post("/runs", json=archive())
    r2 = client.post("/runs", json=archive()).json()["id"]
    client.delete(f"/runs/{r2}")  # en corbeille : inclus quand même

    bundle = client.get("/account/export")
    assert "attachment" in bundle.headers["content-disposition"]
    body = bundle.json()
    assert body["account"]["email"] == "a@b.co"
    assert len(body["runs"]) == 2


# --- Droit à l'effacement ---


def test_erasure_removes_everything_and_deauthenticates() -> None:
    client, mailer = build()
    sign_in(client, mailer, "a@b.co")
    run_id = client.post("/runs", json=archive()).json()["id"]
    client.post(f"/runs/{run_id}/share")

    assert client.delete("/account").json() == {"erased": True}
    # La session ne connecte plus.
    assert client.get("/account").status_code == 401
    # Se reconnecter avec le même email crée un compte neuf, sans les runs d'avant.
    sign_in(client, mailer, "a@b.co")
    assert client.get("/account").json()["runs"] == 0
    assert client.get("/audit").json()["entries"] == []


def test_erasure_also_takes_the_memory_of_ones_runs() -> None:
    # La mémoire est indexée par run, pas par org : elle ne partait donc pas
    # avec le compte. Un droit à l'effacement qui laisse derrière lui les faits
    # établis pendant les runs n'est pas un effacement.
    memory = InMemoryMemory()
    mailer = RecordingEmailSender()
    app = create_app(key="clé", call=None, email=mailer, secure_cookies=False, memory=memory)
    client = TestClient(app)
    sign_in(client, mailer, "a@b.co")

    vivant = client.post("/runs", json=archive()).json()["id"]
    corbeille = client.post("/runs", json=archive()).json()["id"]
    client.delete(f"/runs/{corbeille}")  # à la corbeille, pas détruit
    for run_id in (vivant, corbeille):
        client.post(f"/memory/{run_id}", json={"author": "juriste", "text": "un fait établi"})
    assert len(memory.recall(vivant, "fait", limit=10)) == 1

    assert client.delete("/account").json() == {"erased": True}

    # Vivants comme en corbeille : plus rien.
    assert memory.recall(vivant, "fait", limit=10) == []
    assert memory.recall(corbeille, "fait", limit=10) == []


def test_erasure_touches_no_one_else() -> None:
    mailer = RecordingEmailSender()
    app = create_app(
        key="clé",
        call=None,
        email=mailer,
        secure_cookies=False,
        audit=InMemoryAuditLog(),
    )
    keeper = TestClient(app)
    sign_in(keeper, mailer, "keeper@b.co")
    keeper_run = keeper.post("/runs", json=archive()).json()["id"]

    leaver = TestClient(app)
    sign_in(leaver, mailer, "leaver@b.co")
    leaver.post("/runs", json=archive())
    leaver.delete("/account")

    assert keeper.get(f"/runs/{keeper_run}").status_code == 200
    assert keeper.get("/account").json()["runs"] == 1


def test_erasure_requires_sign_in() -> None:
    client, _ = build()
    assert client.delete("/account").status_code == 401


# --- Rétention ---


@dataclass
class _Bundle:
    runs: Any
    tokens: Any
    sessions: Any


def test_run_purge_removes_expired_credentials_and_old_trash() -> None:
    clock = {"t": 1000.0}
    now = lambda: clock["t"]  # noqa: E731
    runs = InMemoryRunStore(now=now)
    tokens = InMemoryTokenStore(ttl_seconds=60, now=now)
    sessions = InMemorySessionStore(ttl_seconds=60, now=now)

    runs.create(
        "r1",
        Archive(version=1, brief="x", events=[{"type": "work-finished", "sequence": 1}]),
        "orgA",
    )
    runs.delete("r1", "orgA")
    tokens.issue("a@b.co")
    sessions.open("acct-1")
    clock["t"] += 120  # tout expire / la corbeille vieillit

    counts = run_purge(
        _Bundle(runs=runs, tokens=tokens, sessions=sessions), trash_retention_seconds=50
    )
    assert counts == {"trashed_runs": 1, "tokens": 1, "sessions": 1}
