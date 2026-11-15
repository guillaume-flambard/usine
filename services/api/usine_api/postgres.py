"""Les ports d'identité et de runs, adossés à PostgreSQL.

Mêmes contrats que les impls en mémoire (`identity.py`, `runs.py`), donc les
routes ne changent pas. Sélectionnés par `create_app` quand `DATABASE_URL` est
fourni ; sinon on reste en mémoire. Chaque méthode emprunte une connexion au
pool le temps d'une requête (les routes synchrones tournent en multithread).
"""

from __future__ import annotations

import secrets
import time

from psycopg.errors import UniqueViolation
from psycopg.types.json import Json
from psycopg_pool import ConnectionPool

from .audit import AuditEntry
from .db import migrate, open_pool
from .erasure import PostgresErasure
from .identity import (
    SESSION_TTL_SECONDS,
    TOKEN_TTL_SECONDS,
    Account,
    Identity,
    Organization,
    _hash,
)
from .mcp_auth import PostgresMcpAuthStore
from .runs import Archive, Owned, Stored
from .threads import PostgresThreadIndex


class PostgresIdentityStore:
    def __init__(self, pool: ConnectionPool) -> None:
        self._pool = pool

    def _row(self, row: tuple) -> Identity:
        return Identity(
            account=Account(id=row[0], email=row[1]),
            organization=Organization(id=row[2], name=row[3], owner_account_id=row[4]),
        )

    def ensure(self, email: str) -> Identity:
        query = (
            "SELECT a.id, a.email, o.id, o.name, o.owner_account_id "
            "FROM accounts a JOIN organizations o ON o.owner_account_id = a.id "
            "WHERE a.email = %s"
        )
        with self._pool.connection() as conn, conn.transaction():
            found = conn.execute(query, (email,)).fetchone()
            if found is not None:
                return self._row(found)
            account_id = secrets.token_hex(8)
            org_id = secrets.token_hex(8)
            conn.execute("INSERT INTO accounts (id, email) VALUES (%s, %s)", (account_id, email))
            conn.execute(
                "INSERT INTO organizations (id, name, owner_account_id) VALUES (%s, %s, %s)",
                (org_id, email, account_id),
            )
            return Identity(
                account=Account(id=account_id, email=email),
                organization=Organization(id=org_id, name=email, owner_account_id=account_id),
            )

    def by_account(self, account_id: str) -> Identity | None:
        query = (
            "SELECT a.id, a.email, o.id, o.name, o.owner_account_id "
            "FROM accounts a JOIN organizations o ON o.owner_account_id = a.id "
            "WHERE a.id = %s"
        )
        with self._pool.connection() as conn:
            found = conn.execute(query, (account_id,)).fetchone()
        return self._row(found) if found is not None else None

    def forget(self, account_id: str) -> bool:
        # Org avant compte (clé étrangère). Sessions supprimées à part par la route.
        with self._pool.connection() as conn, conn.transaction():
            conn.execute("DELETE FROM organizations WHERE owner_account_id = %s", (account_id,))
            result = conn.execute("DELETE FROM accounts WHERE id = %s", (account_id,))
            return result.rowcount > 0


class PostgresTokenStore:
    def __init__(self, pool: ConnectionPool, *, ttl_seconds: float = TOKEN_TTL_SECONDS) -> None:
        self._pool = pool
        self._ttl = ttl_seconds

    def issue(self, email: str) -> str:
        token = secrets.token_urlsafe(32)
        with self._pool.connection() as conn:
            conn.execute(
                "INSERT INTO magic_link_tokens (token_hash, email, expires_at) VALUES (%s, %s, %s)",
                (_hash(token), email, time.time() + self._ttl),
            )
        return token

    def redeem(self, token: str) -> str | None:
        with self._pool.connection() as conn, conn.transaction():
            # `FOR UPDATE` : deux redemptions concurrentes ne peuvent pas réussir
            # toutes les deux (usage unique tenu sous la concurrence).
            found = conn.execute(
                "SELECT email, expires_at, used FROM magic_link_tokens "
                "WHERE token_hash = %s FOR UPDATE",
                (_hash(token),),
            ).fetchone()
            if found is None or found[2] or found[1] < time.time():
                return None
            conn.execute(
                "UPDATE magic_link_tokens SET used = TRUE WHERE token_hash = %s", (_hash(token),)
            )
            return found[0]

    def forget(self, email: str) -> int:
        with self._pool.connection() as conn:
            return conn.execute("DELETE FROM magic_link_tokens WHERE email = %s", (email,)).rowcount

    def purge_expired(self) -> int:
        with self._pool.connection() as conn:
            return conn.execute(
                "DELETE FROM magic_link_tokens WHERE expires_at < %s", (time.time(),)
            ).rowcount


class PostgresSessionStore:
    def __init__(self, pool: ConnectionPool, *, ttl_seconds: float = SESSION_TTL_SECONDS) -> None:
        self._pool = pool
        self._ttl = ttl_seconds

    def open(self, account_id: str) -> str:
        session_id = secrets.token_urlsafe(32)
        with self._pool.connection() as conn:
            conn.execute(
                "INSERT INTO sessions (session_id, account_id, expires_at) VALUES (%s, %s, %s)",
                (session_id, account_id, time.time() + self._ttl),
            )
        return session_id

    def account(self, session_id: str) -> str | None:
        with self._pool.connection() as conn:
            found = conn.execute(
                "SELECT account_id, expires_at FROM sessions WHERE session_id = %s",
                (session_id,),
            ).fetchone()
        if found is None or found[1] < time.time():
            return None
        return found[0]

    def close(self, session_id: str) -> None:
        with self._pool.connection() as conn:
            conn.execute("DELETE FROM sessions WHERE session_id = %s", (session_id,))

    def forget(self, account_id: str) -> int:
        with self._pool.connection() as conn:
            return conn.execute(
                "DELETE FROM sessions WHERE account_id = %s", (account_id,)
            ).rowcount

    def purge_expired(self) -> int:
        with self._pool.connection() as conn:
            return conn.execute(
                "DELETE FROM sessions WHERE expires_at < %s", (time.time(),)
            ).rowcount


class PostgresRunStore:
    def __init__(self, pool: ConnectionPool) -> None:
        self._pool = pool

    def create(self, run_id: str, archive: Archive, owner: str) -> None:
        try:
            with self._pool.connection() as conn:
                conn.execute(
                    "INSERT INTO runs (run_id, version, brief, events, owner) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (run_id, archive.version, archive.brief, Json(archive.events), owner),
                )
        except UniqueViolation as collision:
            # La contrainte disait déjà non ; sans cette traduction elle sortait
            # en 500, c'est-à-dire indistincte d'une base en panne. Le même
            # refus qu'en mémoire, avec le même code.
            raise Stored(409, "un run existe déjà sous cet identifiant") from collision

    def _archive(self, row: tuple) -> Archive:
        # events : jsonb relu par psycopg en liste Python, tel qu'il a été stocké.
        return Archive(version=row[0], brief=row[1], events=list(row[2]))

    def get(self, run_id: str, viewer: str | None) -> Archive | None:
        with self._pool.connection() as conn:
            found = conn.execute(
                "SELECT version, brief, events, owner, shared FROM runs "
                "WHERE run_id = %s AND trashed_at IS NULL",
                (run_id,),
            ).fetchone()
        if found is None:
            return None
        owner, shared = found[3], found[4]
        # Propriétaire ou partagé, sinon indistinct d'un run absent (ou en corbeille).
        if shared or owner == viewer:
            return self._archive(found)
        return None

    def _list(self, owner: str, *, trashed: bool) -> list[tuple[str, Owned]]:
        clause = "trashed_at IS NOT NULL" if trashed else "trashed_at IS NULL"
        with self._pool.connection() as conn:
            rows = conn.execute(
                f"SELECT run_id, version, brief, events, shared, trashed_at FROM runs "
                f"WHERE owner = %s AND {clause}",
                (owner,),
            ).fetchall()
        return [
            (
                row[0],
                Owned(
                    archive=Archive(version=row[1], brief=row[2], events=list(row[3])),
                    owner=owner,
                    shared=row[4],
                    trashed_at=row[5].timestamp() if row[5] is not None else None,
                ),
            )
            for row in rows
        ]

    def list_for(self, owner: str) -> list[tuple[str, Owned]]:
        return self._list(owner, trashed=False)

    def list_trashed(self, owner: str) -> list[tuple[str, Owned]]:
        return self._list(owner, trashed=True)

    def _set_shared(self, run_id: str, owner: str, shared: bool) -> bool:
        with self._pool.connection() as conn:
            # Un run en corbeille ne se (dé)partage pas.
            result = conn.execute(
                "UPDATE runs SET shared = %s WHERE run_id = %s AND owner = %s "
                "AND trashed_at IS NULL",
                (shared, run_id, owner),
            )
            return result.rowcount > 0

    def share(self, run_id: str, owner: str) -> bool:
        return self._set_shared(run_id, owner, True)

    def revoke(self, run_id: str, owner: str) -> bool:
        return self._set_shared(run_id, owner, False)

    def delete(self, run_id: str, owner: str) -> bool:
        # Corbeille : on pose trashed_at plutôt que de détruire.
        with self._pool.connection() as conn:
            result = conn.execute(
                "UPDATE runs SET trashed_at = now() "
                "WHERE run_id = %s AND owner = %s AND trashed_at IS NULL",
                (run_id, owner),
            )
            return result.rowcount > 0

    def restore(self, run_id: str, owner: str) -> bool:
        with self._pool.connection() as conn:
            result = conn.execute(
                "UPDATE runs SET trashed_at = NULL "
                "WHERE run_id = %s AND owner = %s AND trashed_at IS NOT NULL",
                (run_id, owner),
            )
            return result.rowcount > 0

    def purge(self, run_id: str, owner: str) -> bool:
        # On ne purge que ce qui est en corbeille (jamais un run vivant).
        with self._pool.connection() as conn:
            result = conn.execute(
                "DELETE FROM runs WHERE run_id = %s AND owner = %s AND trashed_at IS NOT NULL",
                (run_id, owner),
            )
            return result.rowcount > 0

    def purge_expired(self, older_than_seconds: float) -> int:
        with self._pool.connection() as conn:
            result = conn.execute(
                "DELETE FROM runs WHERE trashed_at IS NOT NULL "
                "AND trashed_at < now() - make_interval(secs => %s)",
                (older_than_seconds,),
            )
            return result.rowcount

    def forget_owner(self, owner: str) -> int:
        with self._pool.connection() as conn:
            return conn.execute("DELETE FROM runs WHERE owner = %s", (owner,)).rowcount

    def count(self) -> int:
        with self._pool.connection() as conn:
            return conn.execute("SELECT count(*) FROM runs").fetchone()[0]

    def all(self) -> list[Archive]:
        with self._pool.connection() as conn:
            # Corbeille exclue, comme en mémoire : la même règle des deux côtés.
            rows = conn.execute(
                "SELECT version, brief, events FROM runs WHERE trashed_at IS NULL"
            ).fetchall()
        return [Archive(version=row[0], brief=row[1], events=list(row[2])) for row in rows]


class PostgresAuditLog:
    def __init__(self, pool: ConnectionPool) -> None:
        self._pool = pool

    def record(self, org: str, action: str, target: str) -> None:
        with self._pool.connection() as conn:
            conn.execute(
                "INSERT INTO audit_entries (org, action, target) VALUES (%s, %s, %s)",
                (org, action, target),
            )

    def entries(self, org: str) -> list[AuditEntry]:
        with self._pool.connection() as conn:
            rows = conn.execute(
                "SELECT org, action, target, at FROM audit_entries WHERE org = %s ORDER BY at, id",
                (org,),
            ).fetchall()
        return [
            AuditEntry(org=row[0], action=row[1], target=row[2], at=row[3].timestamp())
            for row in rows
        ]

    def forget(self, org: str) -> int:
        with self._pool.connection() as conn:
            return conn.execute("DELETE FROM audit_entries WHERE org = %s", (org,)).rowcount


class PostgresStores:
    """Les stores adossés à un même pool, migrations appliquées."""

    def __init__(self, dsn: str) -> None:
        self.pool = open_pool(dsn)
        migrate(self.pool)
        self.identities = PostgresIdentityStore(self.pool)
        self.tokens = PostgresTokenStore(self.pool)
        self.sessions = PostgresSessionStore(self.pool)
        self.runs = PostgresRunStore(self.pool)
        self.audit = PostgresAuditLog(self.pool)
        # L'index des runs v2 (MEM-18), table `threads` (migration 0005).
        self.threads = PostgresThreadIndex(self.pool)
        # Les jetons du serveur MCP (MEM-40), table `mcp_tokens` (migration 0008).
        self.mcp_auth = PostgresMcpAuthStore(self.pool)
        # L'effacement traverse les cinq tables : il tient sa propre
        # transaction, sur le même pool.
        self.erasure = PostgresErasure(self.pool)
