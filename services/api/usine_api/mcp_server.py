"""Le serveur MCP de l'usine (MEM-39) : ses primitives, depuis n'importe quel client.

Claude Code, Cursor ou l'inspecteur MCP peuvent lister les runs, ouvrir une
trajectoire, lister ses points de fork, et **ouvrir** une branche. Ouvrir, pas
exécuter : `fork_run` demande à l'API une branche amorcée mais arrêtée
(`stream=false`), parce qu'un client d'outils n'a pas à lancer une action à la
place d'une personne. La porte humaine reste devant.

Version installée : **mcp 2.3.0**, où FastMCP s'appelle `MCPServer`
(`mcp.server.mcpserver`) — lu dans le paquet, pas dans un souvenir de la v1.

Le serveur est un **client de l'API** : il ne lit aucune base et ne duplique
aucune règle. Une seule autorité, l'API ; ce module ne fait que traduire des
outils en requêtes.

    python -m usine_api.mcp_server          # stdio, pour un client local
    USINE_MCP_TRANSPORT=streamable-http python -m usine_api.mcp_server

Variables : `USINE_API_URL` (défaut http://127.0.0.1:8000).
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from mcp.server.mcpserver import MCPServer

API_URL = os.environ.get("USINE_API_URL", "http://127.0.0.1:8000").rstrip("/")
TRANSPORT = os.environ.get("USINE_MCP_TRANSPORT", "stdio")

INSTRUCTIONS = (
    "L'usine agentique. Ses runs sont des trajectoires rejouables : on peut les "
    "ouvrir, voir leurs points de fork, et en ouvrir une branche. Une branche "
    "ouverte n'est pas exécutée : elle attend qu'une personne la lance ou décide."
)


def build(client: httpx.AsyncClient | None = None) -> MCPServer:
    """The server, with its four tools. A client can be injected for tests."""
    server = MCPServer(name="usine", instructions=INSTRUCTIONS)

    def api() -> httpx.AsyncClient:
        # A client per call, so a slow run never holds a connection open for the
        # next tool, and so a test can hand its own.
        return client or httpx.AsyncClient(base_url=API_URL, timeout=30.0)

    async def call(method: str, path: str, **kwargs: Any) -> Any:
        if client is not None:
            response = await client.request(method, path, **kwargs)
        else:
            async with api() as made:
                response = await made.request(method, path, **kwargs)
        if response.status_code >= 400:
            detail = ""
            try:
                detail = str(response.json().get("detail", ""))
            except Exception:  # noqa: BLE001 - the status is the fact
                detail = response.text[:200]
            raise RuntimeError(f"{response.status_code} : {detail}")
        return response.json() if response.content else {}

    @server.tool(
        description=(
            "Liste les runs de l'usine, du plus récent au plus ancien. Chaque "
            "run est une trajectoire rejouable, avec son identifiant de fil."
        )
    )
    async def list_runs(limit: int = 20) -> list[dict[str, Any]]:
        page = await call("GET", "/api/runs", params={"limit": max(1, min(limit, 100))})
        return list(page.get("items", []))

    @server.tool(
        description=(
            "Ouvre un run : son statut, ses tours, et les événements qui "
            "dessinent sa scène. Un run en attente de décision porte sa porte."
        )
    )
    async def get_run(thread_id: str) -> dict[str, Any]:
        return await call("GET", f"/api/runs/{thread_id}")

    @server.tool(
        description=(
            "Liste les points de reprise d'un run, du plus récent au plus "
            "ancien. `next` vide signifie que le run est terminé : rien à forker."
        )
    )
    async def list_checkpoints(thread_id: str) -> list[dict[str, Any]]:
        return await call("GET", f"/api/runs/{thread_id}/checkpoints")

    @server.tool(
        description=(
            "Ouvre une branche depuis un point de reprise, sans l'exécuter. "
            "Passe `specialist` pour changer de framework sur la branche. Rien "
            "n'est lancé : une personne décide ensuite."
        )
    )
    async def fork_run(
        thread_id: str,
        checkpoint_id: str | None = None,
        specialist: str | None = None,
        brief: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if checkpoint_id:
            body["checkpoint_id"] = checkpoint_id
        if specialist:
            body["specialist"] = specialist
        if brief:
            body["brief"] = brief
        return await call(
            "POST", f"/api/runs/{thread_id}/fork", params={"stream": "false"}, json=body
        )

    @server.tool(
        description=(
            "Liste les implémentations de spécialistes que ce service sait "
            "exécuter, avec leur framework : c'est ce qu'un fork peut épingler."
        )
    )
    async def list_specialists() -> list[dict[str, Any]]:
        page = await call("GET", "/api/specialists")
        return list(page.get("items", []))

    return server


def main() -> None:
    build().run(transport=TRANSPORT)


if __name__ == "__main__":
    main()
