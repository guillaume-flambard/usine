"""La connexion par lien magique, de bout en bout via le service.

Ce qu'elle garantit : réponse uniforme (pas d'oracle de compte), lien à usage
unique, session posée par cookie HTTP-only, déconnexion.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.identity import (
    InMemoryIdentityStore,
    InMemorySessionStore,
    InMemoryTokenStore,
    RecordingEmailSender,
)
from usine_api.limits import Limits, RateLimiter


def build() -> tuple[TestClient, RecordingEmailSender]:
    mailer = RecordingEmailSender()
    app = create_app(
        identities=InMemoryIdentityStore(),
        tokens=InMemoryTokenStore(),
        sessions=InMemorySessionStore(),
        email=mailer,
        # TestClient parle http : un cookie Secure ne serait pas renvoyé.
        secure_cookies=False,
    )
    return TestClient(app), mailer


def link_token(mailer: RecordingEmailSender) -> str:
    _email, link = mailer.sent[-1]
    return link.split("token=", 1)[1]


def test_request_link_sends_a_link_for_a_plausible_email() -> None:
    client, mailer = build()
    response = client.post("/auth/request-link", json={"email": "a@b.co"})
    assert response.status_code == 200
    assert response.json() == {"sent": True}
    assert len(mailer.sent) == 1


def test_request_link_response_is_identical_for_unknown_and_absurd() -> None:
    client, mailer = build()
    known = client.post("/auth/request-link", json={"email": "a@b.co"})
    absurd = client.post("/auth/request-link", json={"email": "not-an-email"})
    # Même réponse : rien ne dit si un compte existe, ni si l'email est valide.
    assert known.json() == absurd.json() == {"sent": True}
    # Mais rien n'est envoyé pour l'absurde.
    assert len(mailer.sent) == 1


def test_redeeming_a_valid_link_opens_a_session() -> None:
    client, mailer = build()
    client.post("/auth/request-link", json={"email": "a@b.co"})
    token = link_token(mailer)

    redeemed = client.get("/auth/redeem", params={"token": token}, follow_redirects=False)
    assert redeemed.status_code == 303
    assert "usine_session" in redeemed.cookies

    who = client.get("/auth/session")
    assert who.json()["authenticated"] is True
    assert who.json()["email"] == "a@b.co"


def test_a_link_cannot_be_redeemed_twice() -> None:
    client, mailer = build()
    client.post("/auth/request-link", json={"email": "a@b.co"})
    token = link_token(mailer)
    client.get("/auth/redeem", params={"token": token}, follow_redirects=False)

    # Deuxième redemption : refusée, indistincte d'un jeton inconnu.
    again = client.get("/auth/redeem", params={"token": token}, follow_redirects=False)
    assert again.status_code == 400


def test_unknown_expired_used_are_indistinct() -> None:
    client, _mailer = build()
    unknown = client.get("/auth/redeem", params={"token": "nope"}, follow_redirects=False)
    assert unknown.status_code == 400
    assert unknown.json() == {"error": "lien invalide ou expiré"}


def test_session_is_absent_without_a_cookie() -> None:
    client, _mailer = build()
    assert client.get("/auth/session").json() == {"authenticated": False}


def test_logout_ends_the_session() -> None:
    client, mailer = build()
    client.post("/auth/request-link", json={"email": "a@b.co"})
    client.get("/auth/redeem", params={"token": link_token(mailer)}, follow_redirects=False)
    assert client.get("/auth/session").json()["authenticated"] is True

    client.post("/auth/logout")
    assert client.get("/auth/session").json() == {"authenticated": False}


def test_request_link_is_rate_limited() -> None:
    mailer = RecordingEmailSender()
    app = create_app(
        email=mailer,
        secure_cookies=False,
        limiter=RateLimiter(Limits(per_visitor_per_day=1)),
    )
    client = TestClient(app)
    first = client.post("/auth/request-link", json={"email": "a@b.co"})
    second = client.post("/auth/request-link", json={"email": "a@b.co"})
    assert first.status_code == 200
    assert second.status_code == 429
    # Le deuxième n'envoie rien.
    assert len(mailer.sent) == 1
