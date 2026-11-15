"""Serveur MCP de démo : lecture seule du système de fichiers (MEM-82).

Expose deux outils de lecture sur un repertoire racine configure par variable
d'environnement. Aucun outil n'ecrit, rien n'est irreversible. C'est un vrai
serveur MCP (MCPServer, mcp 2.3) monte en streamable-http :

    DEMO_FILESYSTEM_ROOT=/chemin/vers/un/corpus \
    uv run python -m usine_api.demo_filesystem

Le serveur ecoute sur le port 8761 par défaut (DEMO_FILESYSTEM_PORT).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from mcp.server.mcpserver import MCPServer

ROOT = Path(os.environ.get("DEMO_FILESYSTEM_ROOT", ".")).resolve()
PORT = int(os.environ.get("DEMO_FILESYSTEM_PORT", "8761"))

INSTRUCTIONS = (
    "Serveur de lecture seule du systeme de fichiers. Deux outils : "
    "list_directory (liste le contenu d'un repertoire) et read_file (lit un "
    "fichier texte). Tout se passe sous la racine configuree ; aucun chemin en"
    " dehors n'est accessible, et aucun outil n'ecrit."
)

server = MCPServer(name="demo-filesystem", instructions=INSTRUCTIONS)


def _safe_path(requested: str) -> Path:
    """Resoud un chemin demande sous la racine, ou refuse s'il en sort."""
    base = ROOT
    target = (base / requested).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        raise ValueError(f"chemin hors de la racine autorisee : {requested}") from None
    return target


@server.tool(
    description=(
        "Liste le contenu d'un repertoire sous la racine autorisee. Passe un "
        "chemin relatif (exemple 'src' ou 'tests/api'). Retourne les noms des "
        "fichiers et sous-repertoires, avec leur type."
    )
)
async def list_directory(path: str = ".") -> list[dict[str, Any]]:
    target = _safe_path(path)
    if not target.is_dir():
        raise NotADirectoryError(f"{path} n'est pas un repertoire")
    entries: list[dict[str, Any]] = []
    for entry in sorted(target.iterdir()):
        entries.append(
            {
                "name": entry.name,
                "type": "directory" if entry.is_dir() else "file",
                "path": str(entry.relative_to(ROOT)),
            }
        )
    return entries


@server.tool(
    description=(
        "Lit un fichier texte sous la racine autorisee. Passe un chemin relatif "
        "(exemple 'README.md' ou 'src/main.py'). Retourne le contenu texte, ou "
        "une erreur si le fichier est absent ou binaire."
    )
)
async def read_file(path: str) -> str:
    target = _safe_path(path)
    if not target.is_file():
        raise FileNotFoundError(f"{path} n'existe pas ou n'est pas un fichier")
    try:
        return target.read_text(encoding="utf-8")
    except UnicodeDecodeError as cause:
        raise ValueError(f"{path} n'est pas un fichier texte lisible") from cause


def main() -> None:
    server.run(transport="streamable-http", port=PORT)


if __name__ == "__main__":
    main()
