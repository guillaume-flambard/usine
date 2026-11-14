"""La chaîne de connexion à Postgres, assemblée à un seul endroit.

Les déploiements passent les morceaux (`POSTGRES_HOST`, `POSTGRES_PORT`,
`POSTGRES_USER`, `POSTGRES_DB`), jamais la chaîne entière : une chaîne
assemblée porte un identifiant et un mot de passe côte à côte, elle a la forme
d'un secret même quand la valeur est une variable, et les scanners la
signalent à raison.

Le mot de passe arrive de préférence par un fichier (`POSTGRES_PASSWORD_FILE`,
monté par un secret Compose dans `/run/secrets/`), la même convention que
l'image Postgres officielle. `POSTGRES_PASSWORD` reste accepté.
`DATABASE_URL`, si elle est posée, garde la priorité, pour les usages
existants (purge de rétention, tests).
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path
from urllib.parse import quote


def _password(env: Mapping[str, str]) -> str:
    path = env.get("POSTGRES_PASSWORD_FILE", "")
    if path:
        return Path(path).read_text(encoding="utf-8").strip()
    return env.get("POSTGRES_PASSWORD", "")


def database_url(env: Mapping[str, str] | None = None) -> str:
    """Rend la chaîne de connexion, ou une chaîne vide s'il n'y a pas de base."""
    env = os.environ if env is None else env
    explicit = env.get("DATABASE_URL", "")
    if explicit:
        return explicit
    host = env.get("POSTGRES_HOST", "")
    if not host:
        return ""
    user = quote(env.get("POSTGRES_USER", "usine"), safe="")
    password = quote(_password(env), safe="")
    port = env.get("POSTGRES_PORT", "5432")
    name = quote(env.get("POSTGRES_DB", "usine"), safe="")
    credentials = f"{user}:{password}" if password else user
    return f"postgresql://{credentials}@{host}:{port}/{name}"
