"""Qui passe la porte de l'atelier, et par où (MEM-60).

L'atelier est fermé par défaut : une route qui n'est pas listée ici exige une
session (Pocket ID). La liste est courte exprès, et chaque ligne dit pourquoi
elle est publique. Ajouter une route publique est une décision de sécurité.

Le serveur MCP (MEM-39, MEM-40) n'a pas de session : il porte un jeton MCP en
`Authorization: Bearer`. Ce jeton n'ouvre que les routes que ses outils
appellent, et seulement dans la portée du jeton.
"""

from __future__ import annotations

import re

#: (méthode, chemin) servis sans identité.
PUBLIC_ROUTES: frozenset[tuple[str, str]] = frozenset(
    {
        # La sonde de Traefik et d'autodeploy (en GET : la route ne sert pas HEAD).
        ("GET", "/health"),
        # Savoir si l'on est connecté, et se déconnecter.
        ("GET", "/auth/session"),
        ("POST", "/auth/logout"),
        # La connexion elle-même.
        ("GET", "/auth/oidc/login"),
        ("GET", "/auth/oidc/callback"),
        # Le lien magique répond lui-même 404 quand l'atelier est fermé.
        ("POST", "/auth/request-link"),
        ("GET", "/auth/redeem"),
        # Protégées par la clé interne partagée avec le serveur MCP.
        ("POST", "/internal/mcp/verify"),
        ("POST", "/internal/mcp/audit"),
    }
)

_RUN = r"[^/]+"

#: What an MCP token opens, by scope: the routes its tools call, nothing else.
_READ = (
    ("GET", re.compile(r"/api/runs")),
    ("GET", re.compile(rf"/api/runs/{_RUN}")),
    ("GET", re.compile(rf"/api/runs/{_RUN}/checkpoints")),
    ("GET", re.compile(r"/api/specialists")),
)
_FORK = (("POST", re.compile(rf"/api/runs/{_RUN}/fork")),)

BEARER_ROUTES = {"read": _READ, "read_fork": _READ + _FORK}


def is_public(method: str, path: str) -> bool:
    return (method.upper(), path) in PUBLIC_ROUTES


def bearer_allows(scope: str, method: str, path: str) -> bool:
    return any(
        method.upper() == wanted and pattern.fullmatch(path)
        for wanted, pattern in BEARER_ROUTES.get(scope, ())
    )


def bearer_of(header: str) -> str | None:
    """The token in an `Authorization: Bearer` header, or None."""
    kind, _, token = header.partition(" ")
    if kind.lower() != "bearer" or not token.strip():
        return None
    return token.strip()
