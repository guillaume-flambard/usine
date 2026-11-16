"""La connexion à l'atelier par Pocket ID, le fournisseur d'identité du lab (MEM-60).

Décision et raisons : `docs/adr/0002-atelier-authentifie-par-pocket-id.md`.

Le flux est le code d'autorisation avec PKCE (S256), le seul que la découverte
de Pocket ID annonce avec `response_types_supported: ["code"]` et
`code_challenge_methods_supported: ["plain", "S256"]`, relevée le
16 novembre 2026 sur https://auth.memolabs.dev/.well-known/openid-configuration.
Le jeton d'identité est signé en RS256 (`id_token_signing_alg_values_supported`),
et on n'accepte que cet algorithme : un jeton qui annoncerait `none` ou HS256
n'est pas vérifié autrement, il est refusé.

Ce que la vérification exige, dans l'ordre :

1. un `state` connu, pas expiré, et le même que le cookie du navigateur, sinon
   n'importe quel site pourrait connecter une victime au compte de l'attaquant ;
2. si le fournisseur renvoie `iss` dans la redirection (RFC 9207, annoncé par
   `authorization_response_iss_parameter_supported`), c'est l'émetteur attendu ;
3. le jeton d'identité : signature par une clé du JWKS, `iss`, `aud` égal à
   notre client, `exp`, et le `nonce` de cette connexion ;
4. le `sub` est dans la liste blanche. Une liste vide ne laisse entrer
   personne : l'atelier échoue en fermé.

Le compte de l'atelier est rattaché au `sub`, jamais à l'e-mail : un e-mail se
modifie dans un profil, un `sub` non. Rattacher par e-mail laissait quiconque
admis changer le sien pour entrer dans l'organisation d'un autre (revue de
sécurité de MEM-60).
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt
from pydantic import BaseModel

#: Une connexion commencée et pas finie dans ce délai est oubliée.
STATE_TTL_SECONDS = 600

#: Le seul algorithme que Pocket ID annonce, et le seul accepté.
ALGORITHMS = ["RS256"]

STATE_COOKIE = "usine_oidc_state"

#: Connexions commencées et pas finies gardées au plus : au-delà, les plus
#: anciennes sont oubliées. `/auth/oidc/login` est public, il ne doit pas
#: pouvoir remplir la mémoire du service.
MAX_PENDING = 1000

#: A Pocket ID `sub` is a UUID: anything longer is refused before it names an account.
MAX_SUB_LENGTH = 128

#: The domain of the accounts bound to a `sub`. `.invalid` is reserved (RFC 2606):
#: no magic link can ever reach, nor collide with, such an address.
ACCOUNT_DOMAIN = "pocket-id.invalid"


def account_email(sub: str) -> str:
    """The identity key of the atelier account bound to this `sub`.

    Hex-encoded: the identity store lowercases emails, and two subs that differ
    only in case must never share an account.
    """
    return f"{sub.encode().hex()}@{ACCOUNT_DOMAIN}"


class OidcRefused(Exception):
    """La connexion est refusée ; le message reste vague pour le visiteur."""


class OidcSettings(BaseModel):
    issuer: str
    client_id: str
    client_secret: str
    redirect_uri: str
    allowed_subs: frozenset[str]

    @property
    def base(self) -> str:
        return self.issuer.rstrip("/")


def oidc_settings(env: dict[str, str]) -> OidcSettings | None:
    """Les réglages, ou `None` si l'un manque : alors personne ne se connecte."""
    names = (
        "USINE_OIDC_ISSUER",
        "USINE_OIDC_CLIENT_ID",
        "USINE_OIDC_CLIENT_SECRET",
        "USINE_OIDC_REDIRECT_URI",
    )
    values = [env.get(name, "").strip() for name in names]
    if not all(values):
        return None
    subs = frozenset(
        s.strip() for s in env.get("USINE_OIDC_ALLOWED_SUBS", "").split(",") if s.strip()
    )
    issuer, client_id, client_secret, redirect_uri = values
    return OidcSettings(
        # One spelling everywhere: discovery, redirect and token are compared to it.
        issuer=issuer.rstrip("/"),
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=redirect_uri,
        allowed_subs=subs,
    )


@dataclass
class _Pending:
    verifier: str
    nonce: str
    expires: float


@dataclass
class OidcClient:
    settings: OidcSettings
    http: httpx.AsyncClient
    clock: Any = time.time
    _pending: dict[str, _Pending] = field(default_factory=dict)
    _discovery: dict[str, Any] | None = None

    async def _config(self) -> dict[str, Any]:
        if self._discovery is None:
            reply = await self.http.get(f"{self.settings.base}/.well-known/openid-configuration")
            reply.raise_for_status()
            found = _json(reply)
            # The document must describe the issuer we were told to trust.
            if str(found.get("issuer", "")).rstrip("/") != self.settings.base:
                raise OidcRefused("discovery issuer mismatch")
            for name in ("authorization_endpoint", "token_endpoint", "jwks_uri"):
                if not isinstance(found.get(name), str):
                    raise OidcRefused(f"discovery has no {name}")
            self._discovery = found
        return self._discovery

    def _forget_expired(self) -> None:
        now = self.clock()
        for state in [s for s, p in self._pending.items() if p.expires < now]:
            del self._pending[state]

    async def start(self) -> tuple[str, str]:
        """The provider URL to send the browser to, and the state to bind in a cookie."""
        self._forget_expired()
        config = await self._config()
        state = secrets.token_urlsafe(32)
        verifier = secrets.token_urlsafe(48)
        nonce = secrets.token_urlsafe(32)
        while len(self._pending) >= MAX_PENDING:
            # Dicts keep insertion order: the first key is the oldest login.
            del self._pending[next(iter(self._pending))]
        self._pending[state] = _Pending(verifier, nonce, self.clock() + STATE_TTL_SECONDS)
        challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
            .decode()
            .rstrip("=")
        )
        query = urlencode(
            {
                "response_type": "code",
                "client_id": self.settings.client_id,
                "redirect_uri": self.settings.redirect_uri,
                "scope": "openid",
                "state": state,
                "nonce": nonce,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            }
        )
        return f"{config['authorization_endpoint']}?{query}", state

    async def finish(
        self, *, code: str, state: str, cookie_state: str | None, iss: str | None
    ) -> str:
        """Check everything, and return the verified, allowed `sub`."""
        self._forget_expired()
        pending = self._pending.pop(state, None) if state else None
        if pending is None or not cookie_state or not secrets.compare_digest(state, cookie_state):
            raise OidcRefused("unknown or unbound state")
        # Pocket ID announces `authorization_response_iss_parameter_supported`:
        # a redirect without `iss` did not come from it (RFC 9207).
        if iss is None or iss.rstrip("/") != self.settings.base:
            raise OidcRefused("issuer missing or mismatched in the redirect")
        if not code:
            raise OidcRefused("no code")
        config = await self._config()
        reply = await self.http.post(
            config["token_endpoint"],
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self.settings.redirect_uri,
                "code_verifier": pending.verifier,
            },
            auth=(self.settings.client_id, self.settings.client_secret),
        )
        if reply.status_code != 200:
            raise OidcRefused("token endpoint refused the code")
        id_token = _json(reply).get("id_token")
        if not isinstance(id_token, str):
            raise OidcRefused("no id_token")
        claims = await self._verify(id_token, config)
        if claims.get("nonce") != pending.nonce:
            raise OidcRefused("nonce mismatch")
        sub = claims.get("sub")
        if not isinstance(sub, str) or not 0 < len(sub) <= MAX_SUB_LENGTH:
            raise OidcRefused("malformed subject")
        if sub not in self.settings.allowed_subs:
            raise OidcRefused("subject not allowed")
        return sub

    async def _verify(self, token: str, config: dict[str, Any]) -> dict[str, Any]:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as error:
            raise OidcRefused("malformed id_token") from error
        if header.get("alg") not in ALGORITHMS:
            raise OidcRefused("unexpected algorithm")
        reply = await self.http.get(config["jwks_uri"])
        reply.raise_for_status()
        try:
            keys = jwt.PyJWKSet.from_dict(_json(reply))
        except jwt.PyJWTError as error:
            raise OidcRefused("unusable JWKS") from error
        key = next((k for k in keys.keys if k.key_id == header.get("kid")), None)
        if key is None:
            raise OidcRefused("unknown signing key")
        try:
            return jwt.decode(
                token,
                key=key.key,
                algorithms=ALGORITHMS,
                audience=self.settings.client_id,
                issuer=self.settings.base,
                options={"require": ["exp", "iat", "sub", "iss", "aud"]},
            )
        except jwt.PyJWTError as error:
            raise OidcRefused("id_token rejected") from error


def _json(reply: httpx.Response) -> dict[str, Any]:
    """A provider reply as a JSON object, or a refusal: never a 500."""
    try:
        found = reply.json()
    except ValueError as error:
        raise OidcRefused("provider reply is not JSON") from error
    if not isinstance(found, dict):
        raise OidcRefused("provider reply is not a JSON object")
    return found
