"""Le durcissement : en-têtes, journal d'audit, secrets jamais côté client."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.audit import InMemoryAuditLog
from usine_api.identity import RecordingEmailSender


def build() -> tuple[TestClient, RecordingEmailSender]:
    mailer = RecordingEmailSender()
    app = create_app(key="clé-secrète", call=None, email=mailer, secure_cookies=False)
    return TestClient(app), mailer


def sign_in(client: TestClient, mailer: RecordingEmailSender, email: str) -> None:
    client.post("/auth/request-link", json={"email": email})
    token = mailer.sent[-1][1].split("token=", 1)[1]
    client.get("/auth/redeem", params={"token": token}, follow_redirects=False)


def archive() -> dict[str, Any]:
    return {"version": 1, "brief": "x", "events": [{"type": "work-finished", "sequence": 1}]}


# --- En-têtes de durcissement ---


def test_normal_response_carries_hardening_headers() -> None:
    client, _ = build()
    r = client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert r.headers["x-frame-options"] == "DENY"
    # Le durcissement n'écrase pas le no-store.
    assert r.headers["cache-control"] == "no-store"


def test_error_response_is_hardened_too() -> None:
    client, _ = build()
    r = client.get("/runs/inconnu")  # 404 (anonyme)
    assert r.status_code in (401, 404)
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"


# --- Secrets ---


def test_health_reports_readiness_without_the_key() -> None:
    client, _ = build()
    body = client.get("/health").json()
    assert body["ready"] is True
    # La clé elle-même n'apparaît nulle part.
    assert "clé-secrète" not in client.get("/health").text


# --- Journal d'audit ---


def test_a_destructive_action_is_audited() -> None:
    client, mailer = build()
    sign_in(client, mailer, "owner@atelier.co")
    run_id = client.post("/runs", json=archive()).json()["id"]
    client.post(f"/runs/{run_id}/share")
    client.delete(f"/runs/{run_id}")

    entries = client.get("/audit").json()["entries"]
    actions = [(e["action"], e["target"]) for e in entries]
    assert ("share", run_id) in actions
    assert ("trash", run_id) in actions


def test_audit_requires_sign_in() -> None:
    client, _ = build()
    assert client.get("/audit").status_code == 401


def test_one_org_never_sees_anothers_audit() -> None:
    mailer = RecordingEmailSender()
    app = create_app(
        key="clé", call=None, email=mailer, secure_cookies=False, audit=InMemoryAuditLog()
    )
    owner = TestClient(app)
    sign_in(owner, mailer, "owner@atelier.co")
    run_id = owner.post("/runs", json=archive()).json()["id"]
    owner.post(f"/runs/{run_id}/share")

    other = TestClient(app)
    sign_in(other, mailer, "someone-else@atelier.co")
    assert other.get("/audit").json()["entries"] == []


def test_audit_entries_carry_no_secret() -> None:
    log = InMemoryAuditLog()
    log.record("orgA", "share", "r1")
    entry = log.entries("orgA")[0]
    dumped = str(entry.as_json())
    # org, action, cible, temps — et rien d'autre.
    assert set(entry.as_json()) == {"action", "target", "at"}
    assert "token" not in dumped and "clé" not in dumped
