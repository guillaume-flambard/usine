"""L'effacement d'un compte, en une seule décision.

Le droit à l'effacement traversait cinq ports, donc cinq transactions. Un échec
au milieu laissait un compte à moitié effacé, et un 500 qui ne disait pas
jusqu'où on était allé. L'ordre choisi limitait les dégâts (le compte partait en
dernier, donc la personne pouvait se reconnecter et réessayer), mais « on peut
réessayer » n'est pas la même promesse que « ça a eu lieu, ou rien n'a eu lieu ».

Ce module porte cette promesse. Deux implémentations, un seul contrat :

- `PostgresErasure` : tout dans une transaction. Les cinq stores Postgres
  partagent déjà un pool, donc rien n'empêchait de partager aussi la
  transaction — il fallait juste un endroit d'où la tenir.
- `SequentialErasure` : la composition des ports, pour la mémoire vive et pour
  les tests qui injectent leurs impls. Un seul processus, aucune frontière
  réseau à mi-chemin : la garantie y est de fait, pas de mécanisme.

**Ce qui reste dehors, et c'est dit :** la mémoire des runs n'est pas adossée à
Postgres. Elle est vidée par l'appelant, après le commit, à partir des clés
lues avant. Idempotent, et sans effet si la transaction a échoué.
"""

from __future__ import annotations

from typing import Protocol

from psycopg_pool import ConnectionPool

from .audit import AuditLog
from .identity import IdentityStore, SessionStore, TokenStore
from .runs import RunStore


class Erasure(Protocol):
    """Efface tout ce qu'on détient d'une personne, ou n'efface rien."""

    def erase(self, *, account_id: str, org: str, email: str) -> None:
        """Tout ou rien.

        Une exception veut dire que rien n'a été effacé : l'appelant peut rendre
        une erreur sans avoir à deviner l'état.
        """
        ...


class PostgresErasure:
    """Une transaction, dans l'ordre des clés étrangères."""

    def __init__(self, pool: ConnectionPool) -> None:
        self._pool = pool

    def erase(self, *, account_id: str, org: str, email: str) -> None:
        with self._pool.connection() as conn, conn.transaction():
            # `runs` et `audit_entries` ne portent pas de clé étrangère vers le
            # compte ; `sessions` et `organizations` si. D'où cet ordre, qui
            # tient aussi si les contraintes se resserrent un jour.
            conn.execute("DELETE FROM sessions WHERE account_id = %s", (account_id,))
            conn.execute("DELETE FROM runs WHERE owner = %s", (org,))
            conn.execute("DELETE FROM magic_link_tokens WHERE email = %s", (email,))
            conn.execute("DELETE FROM audit_entries WHERE org = %s", (org,))
            conn.execute("DELETE FROM organizations WHERE owner_account_id = %s", (account_id,))
            conn.execute("DELETE FROM accounts WHERE id = %s", (account_id,))


class SequentialErasure:
    """La composition des ports, dans le même ordre.

    Utilisée quand les stores ne partagent pas une base : mémoire vive, ou tests
    qui en injectent un seul. Le compte part en dernier, donc un échec laisse de
    quoi se reconnecter et recommencer.
    """

    def __init__(
        self,
        *,
        runs: RunStore,
        identities: IdentityStore,
        tokens: TokenStore,
        sessions: SessionStore,
        audit: AuditLog,
    ) -> None:
        self._runs = runs
        self._identities = identities
        self._tokens = tokens
        self._sessions = sessions
        self._audit = audit

    def erase(self, *, account_id: str, org: str, email: str) -> None:
        self._sessions.forget(account_id)
        self._runs.forget_owner(org)
        self._tokens.forget(email)
        self._audit.forget(org)
        self._identities.forget(account_id)


class PooledStores(Protocol):
    """Un bundle de stores adossés à un même pool, et son effacement.

    Décrit ici plutôt qu'importé de `postgres` : c'est ce module qui dit de quoi
    le choix a besoin, et l'inverse créerait un cycle.
    """

    erasure: Erasure
    runs: RunStore
    identities: IdentityStore
    tokens: TokenStore
    sessions: SessionStore
    audit: AuditLog


def erasure_for(
    pooled: PooledStores | None,
    *,
    runs: RunStore,
    identities: IdentityStore,
    tokens: TokenStore,
    sessions: SessionStore,
    audit: AuditLog,
) -> Erasure:
    """Transactionnel seulement si les cinq stores sont bien ceux du pool.

    Dès qu'un seul est injecté — un test, un montage mixte — la garantie ne
    tiendrait plus : la transaction ne couvrirait pas le store étranger, et on
    promettrait une atomicité fausse. Dans ce cas on retombe sur la composition
    des ports, et on le dit.
    """
    if pooled is not None and all(
        used is owned
        for used, owned in (
            (runs, pooled.runs),
            (identities, pooled.identities),
            (tokens, pooled.tokens),
            (sessions, pooled.sessions),
            (audit, pooled.audit),
        )
    ):
        return pooled.erasure
    return SequentialErasure(
        runs=runs, identities=identities, tokens=tokens, sessions=sessions, audit=audit
    )
