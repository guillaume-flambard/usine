"""Serveur MCP de démo : lecture seule de GitHub (MEM-82).

Expose deux outils de lecture sur les depots du lab. Aucun outil n'ecrit, rien
n'est irreversible. Un jeton GitHub est requis (GITHUB_TOKEN) pour s'authentifier
aupres de l'API REST GitHub. C'est un vrai serveur MCP (MCPServer, mcp 2.3)
monte en streamable-http :

    GITHUB_TOKEN=ghp_xxxx \
    uv run python -m usine_api.demo_github

Le serveur ecoute sur le port 8762 par defaut (DEMO_GITHUB_PORT).
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from mcp.server.mcpserver import MCPServer

PORT = int(os.environ.get("DEMO_GITHUB_PORT", "8762"))
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
API = "https://api.github.com"

INSTRUCTIONS = (
    "Serveur de lecture seule de GitHub. Deux outils : "
    "list_repos (liste les depots d'une organisation) et read_file (lit un "
    "fichier d'un depot). Requiert GITHUB_TOKEN. Aucun outil n'ecrit."
)

server = MCPServer(name="demo-github", instructions=INSTRUCTIONS)


def _headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "usine-demo-github-mcp",
    }
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return headers


@server.tool(
    description=(
        "Liste les depots publics d'une organisation GitHub. Passe le nom de "
        "l'organisation (exemple 'memolabs-dev'). Retourne une liste de depots "
        "avec leur nom, leur description et leur URL."
    )
)
async def list_repos(org: str) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            f"{API}/orgs/{org}/repos",
            headers=_headers(),
            params={"per_page": 100, "sort": "updated"},
        )
    if response.status_code == 401:
        raise PermissionError("jeton GitHub invalide ou absent (GITHUB_TOKEN)")
    if response.status_code == 403:
        raise PermissionError("acces GitHub refuse (quota ou permissions)")
    if response.status_code >= 400:
        raise RuntimeError(f"GitHub a repondu {response.status_code}")
    repos = response.json()
    return [
        {
            "name": repo.get("name"),
            "full_name": repo.get("full_name"),
            "description": repo.get("description"),
            "html_url": repo.get("html_url"),
            "private": repo.get("private"),
        }
        for repo in repos
    ]


@server.tool(
    description=(
        "Lit le contenu d'un fichier dans un depot GitHub. Passe le proprietaire, "
        "le nom du depot et le chemin du fichier (exemple 'memolabs-dev', 'usine', "
        "'README.md'). Retourne le contenu texte decode (base64 -> texte)."
    )
)
async def read_file(owner: str, repo: str, path: str) -> str:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            f"{API}/repos/{owner}/{repo}/contents/{path}",
            headers=_headers(),
        )
    if response.status_code == 404:
        raise FileNotFoundError(f"{owner}/{repo}/{path} introuvable")
    if response.status_code == 401:
        raise PermissionError("jeton GitHub invalide ou absent (GITHUB_TOKEN)")
    if response.status_code >= 400:
        raise RuntimeError(f"GitHub a repondu {response.status_code}")
    data = response.json()
    import base64

    content = data.get("content", "")
    encoding = data.get("encoding", "")
    if encoding == "base64":
        return base64.b64decode(content).decode("utf-8")
    return content


def main() -> None:
    server.run(transport="streamable-http", port=PORT)


if __name__ == "__main__":
    main()
