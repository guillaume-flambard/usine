"""La base, quand elle est là.

Le service marche sans base (impls en mémoire) ; ce module ne sert que lorsqu'une
`DATABASE_URL` est fournie. Il ouvre un pool de connexions et applique les
migrations SQL versionnées, une fois, dans l'ordre, sans rejouer ce qui l'a
déjà été.

Un pool plutôt qu'une connexion : FastAPI sert les routes synchrones dans un
pool de threads, et une connexion psycopg ne se partage pas entre threads.
"""

from __future__ import annotations

from pathlib import Path

from psycopg_pool import ConnectionPool

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def open_pool(dsn: str) -> ConnectionPool:
    """Ouvre le pool. `open=True` attend qu'une première connexion soit prête,
    pour qu'un DSN faux échoue au démarrage plutôt qu'au premier visiteur."""
    return ConnectionPool(dsn, min_size=1, max_size=8, open=True)


def migrate(pool: ConnectionPool) -> list[str]:
    """Applique les migrations non encore appliquées, dans l'ordre du nom.

    Rend la liste des migrations appliquées durant cet appel (vide si à jour).
    Idempotent : un deuxième appel ne rejoue rien.
    """
    applied: list[str] = []
    with pool.connection() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations "
            "(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        )
        done = {row[0] for row in conn.execute("SELECT name FROM schema_migrations").fetchall()}
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if path.name in done:
                continue
            # Chaque migration dans sa transaction : une qui échoue ne laisse pas
            # la base à moitié migrée.
            with conn.transaction():
                conn.execute(path.read_text(encoding="utf-8"))
                conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,))
            applied.append(path.name)
    return applied
