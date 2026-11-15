"""Les jetons du serveur MCP : révocables, étiquetés, à portée limitée (MEM-40).

Le serveur MCP est exposé à l'extérieur, donc il ne répond jamais sans jeton.
Deux portées, et c'est la seule liste :

- `read`      : les outils de lecture (runs, checkpoints, spécialistes) ;
- `read_fork` : les mêmes, plus `fork_run` — qui **ouvre** une branche sans
  l'exécuter. Aucun jeton ne lance une action : l'exécution d'un run reste une
  demande passée par l'API avec une identité humaine.

On stocke `sha256(jeton)`, jamais le jeton : la table se lit, elle ne sert pas
de trousseau. Un jeton n'est renvoyé à l'écran qu'au moment de sa création.

La vérification par un client MCP se fait **par l'API** (route interne, secrète
partagée) : une seule autorité, et le hachage ne quitte jamais la base.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime
from typing import Any, Literal, Protocol

from psycopg_pool import ConnectionPool
from pydantic import BaseModel, Field

from usine_api.db import migrate

Scope = Literal["read", "read_fork"]
SCOPES: tuple[str, ...] = ("read", "read_fork")

#: Which tools each scope may call. A name not listed here is a refusal.
TOOLS_FOR = {
    "read": frozenset({"list_runs", "get_run", "list_checkpoints", "list_specialists"}),
    "read_fork": frozenset(
        {"list_runs", "get_run", "list_checkpoints", "list_specialists", "fork_run"}
    ),
}

TOKEN_BYTES = 32


class McpToken(BaseModel):
    id: str
    org: str
    label: str
    scope: Scope
    revoked: bool = False
    created_at: datetime


class Secret(BaseModel):
    """Rendered once: the only moment the token exists in clear."""

    id: str
    token: str
    label: str
    scope: Scope
    org: str


#: API shapes (kept here so the route and the client read one definition).
class McpSecret(BaseModel):
    id: str
    token: str
    label: str
    scope: str
    org: str


class McpTokenRequest(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    scope: Scope


class McpBearer(BaseModel):
    token: str = Field(min_length=1)


class McpAudit(BaseModel):
    token: str = Field(min_length=1)
    tool: str = Field(min_length=1, max_length=80)
    target: str | None = None


def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def scope_allows(scope: str, tool: str) -> bool:
    return tool in TOOLS_FOR.get(scope, frozenset())


class McpAuthStore(Protocol):
    def issue(self, org: str, label: str, scope: Scope) -> Secret: ...
    def verify(self, token: str) -> McpToken | None: ...
    def list(self, org: str) -> list[McpToken]: ...
    def revoke(self, token_id: str, org: str) -> bool: ...


class InMemoryMcpAuthStore:
    def __init__(self) -> None:
        self._tokens: dict[str, dict[str, Any]] = {}

    def issue(self, org: str, label: str, scope: Scope) -> Secret:
        raw = issue_token()
        record = {
            "id": secrets.token_hex(8),
            "token_hash": digest(raw),
            "org": org,
            "label": label,
            "scope": scope,
            "revoked": False,
            "created_at": datetime.now(UTC),
        }
        self._tokens[record["id"]] = record
        return Secret(id=record["id"], token=raw, label=label, scope=scope, org=org)

    def verify(self, token: str) -> McpToken | None:
        wanted = digest(token)
        for record in self._tokens.values():
            if record["token_hash"] == wanted and not record["revoked"]:
                return McpToken(
                    id=record["id"],
                    org=record["org"],
                    label=record["label"],
                    scope=record["scope"],
                    created_at=record["created_at"],
                )
        return None

    def list(self, org: str) -> list[McpToken]:
        return [
            McpToken(
                id=record["id"],
                org=record["org"],
                label=record["label"],
                scope=record["scope"],
                revoked=record["revoked"],
                created_at=record["created_at"],
            )
            for record in self._tokens.values()
            if record["org"] == org
        ]

    def revoke(self, token_id: str, org: str) -> bool:
        record = self._tokens.get(token_id)
        if record is None or record["org"] != org:
            return False
        record["revoked"] = True
        return True


class PostgresMcpAuthStore:
    def __init__(self, pool: ConnectionPool) -> None:
        self._pool = pool

    def issue(self, org: str, label: str, scope: Scope) -> Secret:
        with self._pool.connection() as conn:
            migrate(conn)
            row = conn.execute(
                "INSERT INTO mcp_tokens (id, token_hash, org, label, scope) "
                "VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (secrets.token_hex(8), digest(raw := issue_token()), org, label, scope),
            ).fetchone()
        assert row is not None
        return Secret(id=row[0], token=raw, label=label, scope=scope, org=org)

    def verify(self, token: str) -> McpToken | None:
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT id, org, label, scope, revoked, created_at FROM mcp_tokens "
                "WHERE token_hash = %s AND revoked = FALSE",
                (digest(token),),
            ).fetchone()
        if row is None:
            return None
        return McpToken(
            id=row[0], org=row[1], label=row[2], scope=row[3], revoked=row[4], created_at=row[5]
        )

    def list(self, org: str) -> list[McpToken]:
        with self._pool.connection() as conn:
            rows = conn.execute(
                "SELECT id, org, label, scope, revoked, created_at FROM mcp_tokens "
                "WHERE org = %s ORDER BY created_at DESC",
                (org,),
            ).fetchall()
        return [
            McpToken(id=r[0], org=r[1], label=r[2], scope=r[3], revoked=r[4], created_at=r[5])
            for r in rows
        ]

    def revoke(self, token_id: str, org: str) -> bool:
        with self._pool.connection() as conn:
            result = conn.execute(
                "UPDATE mcp_tokens SET revoked = TRUE WHERE id = %s AND org = %s",
                (token_id, org),
            )
            return result.rowcount > 0


__all__ = [
    "SCOPES",
    "McpAuthStore",
    "McpToken",
    "PostgresMcpAuthStore",
    "Secret",
    "digest",
    "scope_allows",
]
