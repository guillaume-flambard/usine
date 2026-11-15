"""Rejeu déterministe des appels au modèle (MEM-24).

Ce que le rejeu doit garantir, et pourquoi il est un fichier plutôt qu'un mode
caché :

- une branche forkée qui repart avant un nœud coûteux rappelle le modèle
  (MEM-23), donc deux branches ne sont comparables que si la partie commune se
  rejoue à l'identique ;
- la vitrine sans clé doit pouvoir montrer un vrai run, pas une animation.

Une cassette est un transport `httpx` : tout ce qui sort de l'API vers LiteLLM
passe déjà par `http_async_client` (models.py), donc un seul point suffit et
rien dans le graphe n'a à connaître le rejeu. Les outils MCP créeront leur
client de la même façon quand ils entreront dans le graphe (M4).

Trois modes :

- `record` : tout passe, et chaque appel est écrit ; c'est ainsi que la cassette
  de démonstration a été produite.
- `replay` : rien ne sort. Un appel absent de la cassette échoue avec un
  message lisible, parce qu'un rejeu qui invente n'est plus un rejeu.
- `hybrid` : la cassette sert les appels qu'elle connaît, le reste part pour de
  vrai et s'ajoute. C'est le mode du fork : la partie déjà enregistrée ne coûte
  rien, la divergence est réelle.

L'identité d'un appel est son contenu : méthode, chemin, et corps JSON dont les
champs volatils sont retirés (`litellm_session_id` change à chaque run, sinon
aucune cassette ne se rejouerait). Un appel identique reçoit donc la réponse
enregistrée, et c'est ce qui rend le rejeu reproductible ; un appel différent,
même d'un caractère, part pour de vrai en `hybrid` ou échoue en `replay`.

Aucun secret dans une cassette : seuls le corps, le chemin et le `content-type`
de la réponse sont écrits. Ni en-tête d'autorisation, ni cookie, ni clé.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Iterable
from pathlib import Path
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger("usine.cassette")

Mode = Literal["record", "replay", "hybrid"]
MODES: tuple[str, ...] = ("record", "replay", "hybrid")

#: Dropped from the digest: they change with every run, no identity in them.
VOLATILE_BODY_KEYS = ("litellm_session_id", "litellm_trace_id", "user")

#: The only response headers a replay needs, and the only ones written.
KEPT_RESPONSE_HEADERS = ("content-type",)


class CassetteMiss(Exception):
    """An answer the cassette does not hold; in `replay`, the run stops here."""


class RequestRecord(BaseModel):
    method: str
    path: str
    body: str = ""


class ResponseRecord(BaseModel):
    status: int
    headers: dict[str, str] = Field(default_factory=dict)
    body: str = ""


class Entry(BaseModel):
    # The SHA-256 of the call: named a digest, not a key, because it is one.
    digest: str
    request: RequestRecord
    response: ResponseRecord


class Cassette(BaseModel):
    version: int = 1
    # Where it was made, for a reader who wonders how real it is.
    source: str = ""
    # The model and the brief it was recorded with: the request body carries the
    # model name, so a replay has to send the same one to match.
    model: str = ""
    brief: str = ""
    entries: list[Entry] = Field(default_factory=list)

    def find(self, digest: str) -> Entry | None:
        for entry in self.entries:
            if entry.digest == digest:
                return entry
        return None

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(
            json.dumps(self.model_dump(mode="json"), indent=2, ensure_ascii=False, sort_keys=True)
            + "\n",
            encoding="utf-8",
        )
        temporary.replace(path)

    @classmethod
    def load(cls, path: Path) -> Cassette:
        return cls.model_validate_json(path.read_text(encoding="utf-8"))


def digest_of(method: str, path: str, body: bytes) -> str:
    """The identity of one call: what it asks, without what changes per run."""
    digest = hashlib.sha256()
    digest.update(method.upper().encode())
    digest.update(b"\n")
    digest.update(path.encode())
    digest.update(b"\n")
    digest.update(_stable_body(body).encode())
    return digest.hexdigest()


def _stable_body(body: bytes) -> str:
    if not body:
        return ""
    try:
        parsed = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return body.decode("utf-8", "replace")
    return json.dumps(_without_volatile(parsed), sort_keys=True, ensure_ascii=False)


def _without_volatile(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _without_volatile(v) for k, v in value.items() if k not in VOLATILE_BODY_KEYS}
    if isinstance(value, list):
        return [_without_volatile(item) for item in value]
    return value


def _kept_headers(headers: Iterable[tuple[str, str]]) -> dict[str, str]:
    return {name: value for name, value in headers if name.lower() in KEPT_RESPONSE_HEADERS}


class CassetteTransport(httpx.AsyncBaseTransport):
    """An httpx transport that records, replays, or does both."""

    def __init__(
        self,
        cassette: Cassette,
        mode: Mode,
        *,
        live: httpx.AsyncBaseTransport | None = None,
        path: Path | None = None,
    ) -> None:
        if mode not in MODES:
            raise ValueError(f"unknown cassette mode: {mode}")
        self._cassette = cassette
        self._mode: Mode = mode
        self._live = live or httpx.AsyncHTTPTransport(retries=0)
        self._path = path
        self.replayed = 0
        self.live_calls = 0

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        body = await request.aread()
        entry = self._cassette.find(digest_of(request.method, request.url.path, body))

        if entry is not None and self._mode != "record":
            self.replayed += 1
            return httpx.Response(
                entry.response.status,
                headers=entry.response.headers,
                content=entry.response.body.encode("utf-8"),
                request=request,
            )
        if self._mode == "replay":
            raise CassetteMiss(
                f"la cassette ne contient pas cet appel ({request.method} {request.url.path}) : "
                "elle a été enregistrée pour un autre brief, ou le prompt a changé depuis."
            )

        self.live_calls += 1
        forwarded = httpx.Request(
            request.method, request.url, headers=request.headers, content=body
        )
        response = await self._live.handle_async_request(forwarded)
        payload = await response.aread()
        # Every live call is kept, in `hybrid` too: that is how the part explored
        # past the recording becomes replayable next time.
        self._cassette.entries.append(
            Entry(
                digest=digest_of(request.method, request.url.path, body),
                request=RequestRecord(
                    method=request.method, path=request.url.path, body=body.decode("utf-8")
                ),
                response=ResponseRecord(
                    status=response.status_code,
                    headers=_kept_headers(response.headers.items()),
                    body=payload.decode("utf-8", "replace"),
                ),
            )
        )
        if self._path is not None:
            self._cassette.save(self._path)
        return httpx.Response(
            response.status_code,
            headers=_kept_headers(response.headers.items()),
            content=payload,
            request=request,
        )

    async def aclose(self) -> None:
        await self._live.aclose()


def open_cassette(path: Path, mode: Mode) -> Cassette:
    """The cassette for a run: an empty one when recording, a real one otherwise."""
    if mode == "record":
        cassette = Cassette(source=str(path))
        logger.warning("cassette enregistrée vers %s", path)
        return cassette
    if not path.exists():
        raise FileNotFoundError(f"cassette introuvable : {path}")
    return Cassette.load(path)
