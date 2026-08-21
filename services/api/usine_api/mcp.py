"""Le client MCP.

« MCP won », dit la carte 2026, et son intérêt propre n'est pas de cocher un
nom : les outils y sont **découverts à l'exécution**. Un agent apprend ce qui
existe en le demandant, donc le graphe se construit sur un outillage que
personne n'avait déclaré — ce qui est exactement l'argument du produit.

Le client vit ici et nulle part ailleurs. Le navigateur ne parle jamais à un
serveur d'outils : il n'a de toute façon pas le droit (`connect-src 'self'`),
et lui donner ce droit reviendrait à ouvrir la page sur l'extérieur.

Ce que ce module implémente : la poignée de main, `tools/list` et `tools/call`,
sur le transport HTTP en JSON-RPC. Le reste du protocole — invites, ressources,
échantillonnage — n'a pas d'appelant ici, et l'écrire sans appelant serait
écrire du code mort.

**Une limite à connaître** : un serveur *avec état* renvoie un identifiant de
session dans un en-tête HTTP, et attend qu'on le renvoie ensuite. Notre
transport ne rend que le corps, donc ces serveurs-là ne sont pas supportés. Les
serveurs sans état — la majorité de ceux qu'on branchera — le sont. Le jour où
il en faudra un, c'est le type `Transport` qui changera, pas ce module.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

PROTOCOL_VERSION = "2025-06-18"

#: Ce qu'un serveur peut rendre d'un coup. Au-delà, il déborde du contexte.
MAX_RESULT_BYTES = 100_000

#: Un serveur qui ne répond pas dans ce délai est un serveur qui ne répond pas.
TIMEOUT_SECONDS = 20


@dataclass(frozen=True)
class Server:
    """Un serveur d'outils, nommé par nous.

    Comme les sources : un agent nomme, il ne fournit jamais une adresse. La
    même règle, pour la même raison.
    """

    name: str
    url: str
    description: str = ""


@dataclass(frozen=True)
class Tool:
    """Un outil découvert. Le schéma vient du serveur, pas de nous."""

    server: str
    name: str
    description: str
    input_schema: dict[str, Any]

    def as_json(self) -> dict[str, Any]:
        return {
            "server": self.server,
            "name": self.name,
            "description": self.description,
            "inputSchema": self.input_schema,
        }


class McpRefusal(Exception):
    """Une demande MCP qu'on ne sert pas, avec sa raison."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


class Transport(Protocol):
    """Un appel JSON-RPC vers un serveur. Injecté pour que les tests s'en passent."""

    async def __call__(self, url: str, payload: dict[str, Any]) -> dict[str, Any]: ...


def _rpc(method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    # L'identifiant est fixe : on n'entrelace pas les appels sur une connexion,
    # donc un compteur serait une complication sans contrepartie.
    return {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}


def _result(answer: dict[str, Any], server: str) -> dict[str, Any]:
    """Relit une réponse JSON-RPC. Un serveur d'outils est une source hostile."""
    if not isinstance(answer, dict):
        raise McpRefusal(502, f"{server} a répondu autre chose que du JSON-RPC")
    if "error" in answer:
        error = answer["error"]
        code = error.get("code") if isinstance(error, dict) else None
        # Le message du serveur ne ressort pas tel quel : il peut contenir
        # n'importe quoi, et il traverserait jusqu'au contexte d'un modèle.
        raise McpRefusal(502, f"{server} a refusé (code {code})")
    result = answer.get("result")
    if not isinstance(result, dict):
        raise McpRefusal(502, f"{server} a répondu sans résultat")
    return result


async def shake_hands(server: Server, *, transport: Transport) -> None:
    """La poignée de main que le protocole exige avant toute demande.

    Un serveur conforme refuse `tools/list` sans elle. L'omettre marchait
    contre les serveurs indulgents et échouait contre les autres — c'est-à-dire
    qu'elle marchait jusqu'au premier vrai serveur.
    """
    await transport(
        server.url,
        _rpc(
            "initialize",
            {
                "protocolVersion": PROTOCOL_VERSION,
                # Aucune capacité annoncée : nous appelons des outils, nous
                # n'en offrons pas, et nous ne recevons pas d'échantillonnage.
                "capabilities": {},
                "clientInfo": {"name": "usine-agentique", "version": "1"},
            },
        ),
    )
    # Notification : pas d'identifiant, pas de réponse attendue.
    await transport(
        server.url,
        {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
    )


async def list_tools(server: Server, *, transport: Transport) -> list[Tool]:
    """Ce que ce serveur sait faire, demandé à l'exécution."""
    try:
        await shake_hands(server, transport=transport)
        answer = await transport(server.url, _rpc("tools/list"))
    except McpRefusal:
        raise
    except Exception as cause:  # noqa: BLE001 — un serveur injoignable est un refus
        raise McpRefusal(502, f"{server.name} est injoignable") from cause

    listed = _result(answer, server.name).get("tools")
    if not isinstance(listed, list):
        return []

    tools: list[Tool] = []
    for entry in listed:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        if not isinstance(name, str) or not name:
            continue
        schema = entry.get("inputSchema")
        tools.append(
            Tool(
                server=server.name,
                name=name,
                description=str(entry.get("description") or "")[:400],
                input_schema=schema if isinstance(schema, dict) else {},
            )
        )
    return tools


async def call_tool(
    server: Server,
    tool: str,
    arguments: dict[str, Any],
    *,
    transport: Transport,
) -> dict[str, Any]:
    """Appelle un outil et rend ce qui revient, borné et aplati en texte."""
    if not tool:
        raise McpRefusal(400, "un outil s'appelle par son nom")

    try:
        await shake_hands(server, transport=transport)
        answer = await transport(
            server.url, _rpc("tools/call", {"name": tool, "arguments": arguments})
        )
    except McpRefusal:
        raise
    except Exception as cause:  # noqa: BLE001
        raise McpRefusal(502, f"{server.name} est injoignable") from cause

    result = _result(answer, server.name)
    text = _flatten(result.get("content"))
    return {
        "server": server.name,
        "tool": tool,
        # `isError` est le canal par lequel MCP dit qu'un outil a échoué sans
        # que l'appel ait échoué. Le distinguer permet à un agent de réessayer
        # autrement plutôt que de croire le serveur en panne.
        "failed": result.get("isError") is True,
        "text": text[:MAX_RESULT_BYTES],
        "truncated": len(text) > MAX_RESULT_BYTES,
    }


def _flatten(content: Any) -> str:
    """Aplatit le contenu MCP en texte.

    Un agent reçoit du texte : c'est ce qu'il sait manipuler, et c'est ce qui
    entre dans un contexte. Les parties non textuelles sont nommées plutôt que
    tues — un agent qui ne sait pas qu'une image est revenue croirait à un
    outil muet.
    """
    if not isinstance(content, list):
        return ""
    pieces: list[str] = []
    for part in content:
        if not isinstance(part, dict):
            continue
        kind = part.get("type")
        if kind == "text" and isinstance(part.get("text"), str):
            pieces.append(part["text"])
        elif isinstance(kind, str):
            pieces.append(f"({kind} non textuel)")
    return "\n".join(pieces)
