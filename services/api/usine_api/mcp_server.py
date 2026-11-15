"""Le serveur MCP de l'usine (MEM-39 + MEM-40) : ses primitives, authentifiées.

Claude Code, Cursor ou l'inspecteur MCP peuvent lister les runs, ouvrir une
trajectoire, lister ses points de fork, et **ouvrir** une branche. Ouvrir, pas
exécuter : `fork_run` demande à l'API une branche amorcée mais arrêtée
(`stream=false`), parce qu'un client d'outils n'a pas à lancer une action à la
place d'une personne. La porte humaine reste devant.

Le serveur est un **client de l'API** : il ne lit aucune base et ne duplique
aucune règle. Une seule autorité, l'API ; ce module ne fait que traduire des
outils en requêtes. Chaque outil exige un jeton MCP valide (MEM-40) :

- pas de jeton configuré → 401 sur chaque outil ;
- portée `read` → lecture uniquement, `fork_run` refusé (403) ;
- portée `read_fork` → lecture plus ouverture de branche.

Le jeton est vérifié auprès de l'API à chaque appel (`/internal/mcp/verify`),
et chaque appel est journalisé (`/internal/mcp/audit`, aucun secret n'y entre).

Variables : `USINE_API_URL`, `USINE_MCP_TRANSPORT`, `USINE_MCP_TOKEN`,
`USINE_INTERNAL_SECRET`.

    python -m usine_api.mcp_server          # stdio, pour un client local
    USINE_MCP_TRANSPORT=streamable-http python -m usine_api.mcp_server

Spéc source : Model Context Protocol 2025-06-18, section « Authorization »
(bearer token, Basic et porteur) — https://spec.modelcontextprotocol.io/2025-06-18/
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

# Outils accessibles avec la portée lecture seule.
READ_ONLY_TOOLS = frozenset({"list_runs", "get_run", "list_checkpoints", "list_specialists"})
# Outils qui nécessitent la portée lecture + fork.
FORK_TOOLS = frozenset({"fork_run"})


def scope_allows(scope: str, tool: str) -> bool:
    """Un jeton de portée `scope` peut-il appeler `tool` ?"""
    if tool in READ_ONLY_TOOLS:
        return scope in {"read", "read_fork"}
    if tool in FORK_TOOLS:
        return scope == "read_fork"
    return False


class McpUnauthorized(RuntimeError):
    """Le serveur MCP est appelé sans jeton valide ou avec une portée insuffisante."""


def build(
    client: httpx.AsyncClient | None = None,
    token: str | None = None,
    internal_secret: str | None = None,
) -> MCPServer:
    """The server, with its five tools. A client can be injected for tests."""
    server = MCPServer(name="usine", instructions=INSTRUCTIONS)

    token = token or os.environ.get("USINE_MCP_TOKEN", "")
    internal_secret = internal_secret or os.environ.get("USINE_INTERNAL_SECRET", "")

    def api() -> httpx.AsyncClient:
        # A client per call, so a slow run never holds a connection open for the
        # next tool, and so a test can hand its own.
        return client or httpx.AsyncClient(base_url=API_URL, timeout=30.0)

    async def request(
        method: str,
        path: str,
        *,
        auth: bool = False,
        internal: bool = False,
        **kwargs: Any,
    ) -> Any:
        headers = dict(kwargs.pop("headers", {}))
        if auth:
            headers["Authorization"] = f"Bearer {token}"
        if internal:
            headers["x-usine-internal"] = internal_secret
        if client is not None:
            response = await client.request(method, path, headers=headers, **kwargs)
        else:
            async with api() as made:
                response = await made.request(method, path, headers=headers, **kwargs)
        if response.status_code >= 400:
            detail = ""
            try:
                detail = str(response.json().get("detail", ""))
            except Exception:  # noqa: BLE001 - the status is the fact
                detail = response.text[:200]
            raise RuntimeError(f"{response.status_code} : {detail}")
        return response.json() if response.content else {}

    async def verified_profile() -> dict[str, Any]:
        """Vérifie le jeton MCP auprès de l'API et retourne son profil."""
        if not token:
            raise McpUnauthorized("401 : aucun jeton MCP configuré.")
        return await request(
            "POST",
            "/internal/mcp/verify",
            internal=True,
            json={"token": token},
        )

    async def audit_call(tool: str, target: str | None = None) -> None:
        """Journalise l'appel d'outil (aucun secret n'y entre)."""
        if not token:
            return
        await request(
            "POST",
            "/internal/mcp/audit",
            internal=True,
            json={"token": token, "tool": tool, "target": target},
        )

    def require(tool: str, profile: dict[str, Any]) -> None:
        """Refuse l'outil si la portée du jeton ne le permet pas."""
        scope = profile.get("scope", "")
        if not scope_allows(scope, tool):
            raise McpUnauthorized(f"403 : portée {scope!r} insuffisante pour {tool}.")

    @server.tool(
        description=(
            "Liste les runs de l'usine, du plus récent au plus ancien. Chaque "
            "run est une trajectoire rejouable, avec son identifiant de fil. "
            "Exige un jeton MCP de portée `read` ou `read_fork`."
        )
    )
    async def list_runs(limit: int = 20) -> list[dict[str, Any]]:
        profile = await verified_profile()
        require("list_runs", profile)
        page = await request(
            "GET",
            "/api/runs",
            params={"limit": max(1, min(limit, 100))},
            auth=True,
        )
        await audit_call("list_runs")
        return list(page.get("items", []))

    @server.tool(
        description=(
            "Ouvre un run : son statut, ses tours, et les événements qui "
            "dessinent sa scène. Un run en attente de décision porte sa porte. "
            "Exige un jeton MCP de portée `read` ou `read_fork`."
        )
    )
    async def get_run(thread_id: str) -> dict[str, Any]:
        profile = await verified_profile()
        require("get_run", profile)
        result = await request("GET", f"/api/runs/{thread_id}", auth=True)
        await audit_call("get_run", thread_id)
        return result

    @server.tool(
        description=(
            "Liste les points de reprise d'un run, du plus récent au plus "
            "ancien. `next` vide signifie que le run est terminé : rien à forker. "
            "Exige un jeton MCP de portée `read` ou `read_fork`."
        )
    )
    async def list_checkpoints(thread_id: str) -> list[dict[str, Any]]:
        profile = await verified_profile()
        require("list_checkpoints", profile)
        result = await request("GET", f"/api/runs/{thread_id}/checkpoints", auth=True)
        await audit_call("list_checkpoints", thread_id)
        return result

    @server.tool(
        description=(
            "Ouvre une branche depuis un point de reprise, sans l'exécuter. "
            "Passe `specialist` pour changer de framework sur la branche. Rien "
            "n'est lancé : une personne décide ensuite. "
            "Exige un jeton MCP de portée `read_fork`."
        )
    )
    async def fork_run(
        thread_id: str,
        checkpoint_id: str | None = None,
        specialist: str | None = None,
        brief: str | None = None,
    ) -> dict[str, Any]:
        profile = await verified_profile()
        require("fork_run", profile)
        body: dict[str, Any] = {}
        if checkpoint_id:
            body["checkpoint_id"] = checkpoint_id
        if specialist:
            body["specialist"] = specialist
        if brief:
            body["brief"] = brief
        result = await request(
            "POST",
            f"/api/runs/{thread_id}/fork",
            params={"stream": "false"},
            json=body,
            auth=True,
        )
        await audit_call("fork_run", thread_id)
        return result

    @server.tool(
        description=(
            "Liste les implémentations de spécialistes que ce service sait "
            "exécuter, avec leur framework : c'est ce qu'un fork peut épingler. "
            "Exige un jeton MCP de portée `read` ou `read_fork`."
        )
    )
    async def list_specialists() -> list[dict[str, Any]]:
        profile = await verified_profile()
        require("list_specialists", profile)
        page = await request("GET", "/api/specialists", auth=True)
        await audit_call("list_specialists")
        return list(page.get("items", []))

    return server


def main() -> None:
    build().run(transport=TRANSPORT)


if __name__ == "__main__":
    main()
