"""La purge de rétention, exécutable en commande.

    DATABASE_URL=postgresql://… uv run python -m usine_api.maintenance

Enlève ce qui a dépassé sa conservation : runs en corbeille au-delà de la
fenêtre, jetons et sessions expirés. Opérable contre la base seule (le service
peut être arrêté) ; sa planification régulière est de l'infra.
"""

from __future__ import annotations

import os
from typing import Any


def run_purge(stores: Any, trash_retention_seconds: float) -> dict[str, int]:
    """Applique la rétention sur un jeu de stores et rend les comptes retirés.

    `stores` expose `runs`, `tokens`, `sessions` — un `PostgresStores` en prod,
    ou n'importe quel porteur équivalent en test.
    """
    return {
        "trashed_runs": stores.runs.purge_expired(trash_retention_seconds),
        "tokens": stores.tokens.purge_expired(),
        "sessions": stores.sessions.purge_expired(),
    }


def main() -> None:
    from .settings import database_url

    dsn = database_url()
    if not dsn:
        raise SystemExit("DATABASE_URL ou POSTGRES_HOST requis pour la purge de rétention")
    days = float(os.environ.get("RUN_TRASH_RETENTION_DAYS", "30"))

    from .postgres import PostgresStores

    stores = PostgresStores(dsn)
    try:
        counts = run_purge(stores, days * 86_400)
    finally:
        stores.pool.close()
    print(  # noqa: T201 — une commande CLI parle sur la sortie standard
        f"purge: {counts['trashed_runs']} run(s) en corbeille, "
        f"{counts['tokens']} jeton(s), {counts['sessions']} session(s)"
    )


if __name__ == "__main__":
    main()
