"""La porte de l'atelier (MEM-60) : fermée par défaut, ouverte par Pocket ID.

Ce que ces tests protègent :

- toute route de l'atelier, sans identité, répond 401 et jamais du contenu,
  y compris une route ajoutée demain (on parcourt les routes déclarées) ;
- un visiteur anonyme ne déclenche aucun appel de modèle ;
- le lien magique est coupé quand l'atelier est fermé ;
- un jeton MCP n'ouvre que les routes de ses outils, dans sa portée et son
  organisation ;
- la connexion Pocket ID vérifie l'état, l'émetteur, la signature, l'audience,
  le nonce et la liste blanche, et échoue en fermé ;
- l'identité va jusqu'à Langfuse (`user_id`).

Le fournisseur est simulé par un `httpx.MockTransport` qui signe ses jetons
avec une vraie clé RSA : c'est la vérification de signature du code qui est
éprouvée, pas un raccourci de test.
"""

from __future__ import annotations

import re
import time
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from test_fork import CountingPlanner, CountingSpecialist

from usine_api.app import create_app
from usine_api.atelier import PUBLIC_ROUTES
from usine_api.identity import InMemoryIdentityStore, InMemorySessionStore
from usine_api.mcp_auth import InMemoryMcpAuthStore
from usine_api.oidc import MAX_PENDING, STATE_COOKIE, OidcClient, OidcSettings, account_email

ISSUER = "https://auth.example.test"
CLIENT = "usine-client"
OWNER_SUB = "owner-sub"
KID = "key-1"


class CountingCall:
    """The v1 model caller (`/reason`): counts, never answers."""

    def __init__(self) -> None:
        self.calls = 0

    async def __call__(self, *args: Any, **kwargs: Any) -> Any:
        self.calls += 1
        raise AssertionError("a model was called")


def closed_app(**kwargs: Any) -> Any:
    return create_app(
        planner=kwargs.pop("planner", CountingPlanner()),
        specialist=kwargs.pop("specialist", CountingSpecialist()),
        open_atelier=False,
        secure_cookies=False,
        **kwargs,
    )


def concrete(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "x", path)


def test_without_identity_every_atelier_route_is_a_401() -> None:
    app = closed_app()
    checked = 0
    with TestClient(app) as client:
        for route in app.routes:
            if not isinstance(route, APIRoute):
                continue
            for method in route.methods - {"HEAD", "OPTIONS"}:
                if (method, route.path) in PUBLIC_ROUTES:
                    continue
                reply = client.request(method, concrete(route.path), json={})
                assert reply.status_code == 401, (method, route.path, reply.status_code)
                assert reply.json() == {"detail": "Connexion requise."}
                checked += 1
    # The openapi document is closed too, and the walk really walked.
    assert TestClient(app).get("/api/openapi.json").status_code == 401
    assert checked > 40


def test_an_anonymous_visitor_never_calls_a_model() -> None:
    planner, specialist, call = CountingPlanner(), CountingSpecialist(), CountingCall()
    app = closed_app(planner=planner, specialist=specialist, call=call, key="clé")
    with TestClient(app) as client:
        message = {"role": "user", "parts": [{"type": "text", "text": "brief"}]}
        for method, path, body in (
            ("POST", "/api/chat", {"id": "t", "messages": [message]}),
            ("POST", "/api/compare", {"brief": "b"}),
            ("POST", "/reason", {"messages": []}),
            ("POST", "/portes/x/juger", {}),
        ):
            assert client.request(method, path, json=body).status_code == 401
    assert (planner.calls, specialist.calls, call.calls) == (0, 0, 0)


def test_the_magic_link_is_cut_when_the_atelier_is_closed() -> None:
    with TestClient(closed_app()) as client:
        assert client.post("/auth/request-link", json={"email": "a@b.co"}).status_code == 404
        assert client.get("/auth/redeem", params={"token": "t"}).status_code == 404
        assert client.get("/health").status_code == 200
        assert client.get("/auth/session").json() == {"authenticated": False}


def test_a_session_opens_the_atelier_and_reaches_langfuse(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import usine_api.chat_stream as chat_stream

    seen: list[str | None] = []
    real = chat_stream.run_config

    def spy(thread_id: str, **kwargs: Any) -> Any:
        seen.append(kwargs.get("user_id"))
        return real(thread_id, **kwargs)

    monkeypatch.setattr(chat_stream, "run_config", spy)
    people, seats = InMemoryIdentityStore(), InMemorySessionStore()
    owner = people.ensure("owner@atelier.co")
    app = closed_app(identities=people, sessions=seats)
    with TestClient(app, cookies={"usine_session": seats.open(owner.account.id)}) as client:
        assert client.get("/api/runs").status_code == 200
        message = {"role": "user", "parts": [{"type": "text", "text": "brief"}]}
        assert client.post("/api/chat", json={"id": "t1", "messages": [message]}).status_code == 200
    assert seen == [owner.account.id]


def test_an_mcp_token_opens_only_its_tools_routes_in_its_scope() -> None:
    tokens = InMemoryMcpAuthStore()
    read = tokens.issue("org-a", "lecture", "read").token
    fork = tokens.issue("org-a", "fork", "read_fork").token
    with TestClient(closed_app(mcp_auth=tokens)) as client:

        def as_(token: str, method: str, path: str) -> int:
            reply = client.request(
                method, path, headers={"authorization": f"Bearer {token}"}, json={}
            )
            return reply.status_code

        assert as_(read, "GET", "/api/runs") == 200
        assert as_(read, "GET", "/api/specialists") == 200
        assert as_(read, "GET", "/api/runs/x") == 404  # passed the door, unknown run
        assert as_(read, "POST", "/api/runs/x/fork") == 401
        assert as_(read, "POST", "/api/chat") == 401
        assert as_(read, "GET", "/api/runs/x/export") == 401
        assert as_(read, "POST", "/api/mcp/tokens") == 401
        assert as_(fork, "POST", "/api/runs/x/fork") == 404
        assert as_("not-a-token", "GET", "/api/runs") == 401


# --- Pocket ID, simulated -------------------------------------------------------------


class Provider:
    """A minimal OIDC provider that signs with a real RSA key."""

    def __init__(self) -> None:
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.claims: dict[str, Any] = {}
        self.alg = "RS256"
        self.signing_key: Any = self.key
        self.last_authorize: dict[str, list[str]] = {}
        self.token_requests: list[dict[str, list[str]]] = []

    def jwks(self) -> dict[str, Any]:
        public = jwt.algorithms.RSAAlgorithm.to_jwk(self.key.public_key(), as_dict=True)
        return {"keys": [{**public, "kid": KID, "use": "sig", "alg": "RS256"}]}

    def id_token(self, nonce: str) -> str:
        now = int(time.time())
        claims = {
            "iss": ISSUER,
            "aud": CLIENT,
            "sub": OWNER_SUB,
            "email": "owner@atelier.co",
            "iat": now,
            "exp": now + 300,
            "nonce": nonce,
            **self.claims,
        }
        if self.alg == "none":
            return jwt.encode(claims, None, algorithm="none", headers={"kid": KID})
        return jwt.encode(claims, self.signing_key, algorithm=self.alg, headers={"kid": KID})

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/.well-known/openid-configuration":
            return httpx.Response(
                200,
                json={
                    "issuer": ISSUER,
                    "authorization_endpoint": f"{ISSUER}/authorize",
                    "token_endpoint": f"{ISSUER}/api/oidc/token",
                    "jwks_uri": f"{ISSUER}/.well-known/jwks.json",
                },
            )
        if request.url.path == "/.well-known/jwks.json":
            return httpx.Response(200, json=self.jwks())
        if request.url.path == "/api/oidc/token":
            form = parse_qs(request.content.decode())
            self.token_requests.append(form)
            if form.get("code") != ["good-code"]:
                return httpx.Response(400, json={"error": "invalid_grant"})
            return httpx.Response(200, json={"id_token": self.id_token(self.nonce)})
        return httpx.Response(404)

    @property
    def nonce(self) -> str:
        return self.last_authorize["nonce"][0]


def oidc_app(
    provider: Provider,
    allowed: frozenset[str] = frozenset({OWNER_SUB}),
    **kwargs: Any,
) -> Any:
    client = OidcClient(
        OidcSettings(
            issuer=ISSUER,
            client_id=CLIENT,
            client_secret="secret",
            redirect_uri="http://testserver/auth/oidc/callback",
            allowed_subs=allowed,
        ),
        httpx.AsyncClient(transport=httpx.MockTransport(provider.handler)),
    )
    return closed_app(oidc=client, **kwargs)


def log_in(client: TestClient, provider: Provider, **callback: str) -> httpx.Response:
    started = client.get("/auth/oidc/login", follow_redirects=False)
    assert started.status_code == 303
    target = urlparse(started.headers["location"])
    assert f"{target.scheme}://{target.netloc}{target.path}" == f"{ISSUER}/authorize"
    provider.last_authorize = parse_qs(target.query)
    params = {"code": "good-code", "state": provider.last_authorize["state"][0], "iss": ISSUER}
    params.update(callback)
    return client.get("/auth/oidc/callback", params=params, follow_redirects=False)


def test_pocket_id_logs_the_owner_in_with_pkce() -> None:
    provider = Provider()
    with TestClient(oidc_app(provider)) as client:
        assert client.get("/api/runs").status_code == 401
        done = log_in(client, provider)
        assert done.status_code == 303
        asked = provider.last_authorize
        assert asked["code_challenge_method"] == ["S256"]
        assert asked["scope"] == ["openid"]
        # The verifier sent to the token endpoint is the one behind the challenge.
        import base64
        import hashlib

        verifier = provider.token_requests[-1]["code_verifier"][0]
        challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
            .decode()
            .rstrip("=")
        )
        assert asked["code_challenge"] == [challenge]
        assert client.get("/api/runs").status_code == 200
        assert client.get("/auth/session").json()["email"] == account_email(OWNER_SUB)


@pytest.mark.parametrize(
    "tamper",
    [
        "other-sub",
        "wrong-audience",
        "wrong-issuer",
        "wrong-nonce",
        "expired",
        "foreign-key",
        "alg-none",
        "sub-too-long",
    ],
)
def test_pocket_id_refuses_a_bad_token(tamper: str) -> None:
    provider = Provider()
    provider.claims = {
        "other-sub": {"sub": "intruder"},
        "wrong-audience": {"aud": "another-client"},
        "wrong-issuer": {"iss": "https://evil.test"},
        "wrong-nonce": {"nonce": "replayed"},
        "expired": {"exp": int(time.time()) - 60},
        "sub-too-long": {"sub": "x" * 129},
    }.get(tamper, {})
    if tamper == "foreign-key":
        provider.signing_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    if tamper == "alg-none":
        provider.alg = "none"
    with TestClient(oidc_app(provider)) as client:
        assert log_in(client, provider).status_code == 403
        assert client.get("/api/runs").status_code == 401


def test_pocket_id_refuses_a_forged_or_unbound_state() -> None:
    provider = Provider()
    with TestClient(oidc_app(provider)) as client:
        assert log_in(client, provider, state="forged").status_code == 403
        assert log_in(client, provider, iss="https://evil.test").status_code == 403
        # A state started in another browser: the cookie does not match.
        log_in_url = client.get("/auth/oidc/login", follow_redirects=False).headers["location"]
        state = parse_qs(urlparse(log_in_url).query)["state"][0]
        client.cookies.set(STATE_COOKIE, "someone-else")
        reply = client.get(
            "/auth/oidc/callback",
            params={"code": "good-code", "state": state},
            follow_redirects=False,
        )
        assert reply.status_code == 403
        assert client.get("/api/runs").status_code == 401


def test_an_empty_allowlist_lets_nobody_in() -> None:
    provider = Provider()
    with TestClient(oidc_app(provider, allowed=frozenset())) as client:
        assert log_in(client, provider).status_code == 403


def test_closed_without_pocket_id_nobody_can_log_in() -> None:
    with TestClient(closed_app()) as client:
        assert client.get("/auth/oidc/login", follow_redirects=False).status_code == 503
        assert client.get("/api/runs").status_code == 401


def test_the_email_claim_never_picks_the_account() -> None:
    """Review of MEM-60: an allowed sub that claims someone's email stays itself."""
    provider = Provider()
    people = InMemoryIdentityStore()
    victim = people.ensure("victim@atelier.co")
    provider.claims = {"email": "victim@atelier.co", "email_verified": False}
    with TestClient(oidc_app(provider, identities=people)) as client:
        assert log_in(client, provider).status_code == 303
        session = client.get("/auth/session").json()
        assert session["org"] != victim.organization.id
        assert session["email"] == account_email(OWNER_SUB)


def test_subs_that_differ_only_in_case_get_different_accounts() -> None:
    assert account_email("Abc") != account_email("abc")


def test_a_redirect_without_iss_is_refused() -> None:
    provider = Provider()
    with TestClient(oidc_app(provider)) as client:
        started = client.get("/auth/oidc/login", follow_redirects=False).headers["location"]
        provider.last_authorize = parse_qs(urlparse(started).query)
        reply = client.get(
            "/auth/oidc/callback",
            params={"code": "good-code", "state": provider.last_authorize["state"][0]},
            follow_redirects=False,
        )
        assert reply.status_code == 403


def test_pending_logins_are_capped() -> None:
    provider = Provider()
    app = oidc_app(provider, limiter=_NoLimit())
    with TestClient(app) as client:
        for _ in range(MAX_PENDING + 50):
            assert client.get("/auth/oidc/login", follow_redirects=False).status_code == 303
    oidc = next(c.cell_contents for c in _closure(app) if isinstance(c.cell_contents, OidcClient))
    assert len(oidc._pending) == MAX_PENDING


def test_logging_in_is_rate_limited() -> None:
    from usine_api.limits import Limits, RateLimiter

    provider = Provider()
    tight = RateLimiter(Limits(per_minute=2, per_visitor_per_day=100, per_day=100))
    with TestClient(oidc_app(provider, limiter=tight)) as client:
        codes = [
            client.get("/auth/oidc/login", follow_redirects=False).status_code for _ in range(3)
        ]
    assert codes == [303, 303, 429]


def test_a_broken_provider_reply_is_a_refusal_not_a_crash() -> None:
    provider = Provider()

    def broken(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/oidc/token":
            return httpx.Response(200, text="<html>not json</html>")
        return provider.handler(request)

    client_ = OidcClient(
        OidcSettings(
            issuer=ISSUER + "/",
            client_id=CLIENT,
            client_secret="secret",
            redirect_uri="http://testserver/auth/oidc/callback",
            allowed_subs=frozenset({OWNER_SUB}),
        ),
        httpx.AsyncClient(transport=httpx.MockTransport(broken)),
    )
    with TestClient(closed_app(oidc=client_)) as client:
        assert log_in(client, provider).status_code == 403


class _NoLimit:
    def allow(self, address: str) -> None:
        return None

    def remaining(self, address: str) -> Any:  # pragma: no cover - unused here
        raise NotImplementedError


def _closure(app: Any) -> list[Any]:
    """The cells of the route handler that holds the OIDC client."""
    for route in app.routes:
        if getattr(route, "path", "") == "/auth/oidc/login":
            return list(route.endpoint.__closure__ or [])
    raise AssertionError("no login route")


def test_through_the_closed_door_a_token_sees_only_its_own_org() -> None:
    people, seats, tokens = InMemoryIdentityStore(), InMemorySessionStore(), InMemoryMcpAuthStore()
    owner = people.ensure("owner@atelier.co")
    mine = tokens.issue(owner.organization.id, "mien", "read").token
    theirs = tokens.issue("org-other", "autre", "read").token
    app = closed_app(identities=people, sessions=seats, mcp_auth=tokens)
    with TestClient(app) as client:
        message = {"role": "user", "parts": [{"type": "text", "text": "brief"}]}
        cookie = {"cookie": f"usine_session={seats.open(owner.account.id)}"}
        client.post("/api/chat", json={"id": "run-a", "messages": [message]}, headers=cookie)

        def read(token: str, path: str) -> httpx.Response:
            return client.get(path, headers={"authorization": f"Bearer {token}"})

        assert [r["thread_id"] for r in read(mine, "/api/runs").json()["items"]] == ["run-a"]
        assert read(mine, "/api/runs/run-a").status_code == 200
        assert read(theirs, "/api/runs").json()["items"] == []
        assert read(theirs, "/api/runs/run-a").status_code == 404
