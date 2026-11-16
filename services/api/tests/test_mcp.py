"""Le client MCP.

Ce que ces tests protègent : les outils sont découverts à l'exécution, un
serveur muet ne fait pas taire les autres, et rien de ce qu'un serveur dit ne
traverse jusqu'au contexte d'un modèle sans être relu.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.mcp import MAX_RESULT_BYTES, McpRefusal, Server, call_tool, list_tools

METEO = Server(name="meteo", url="https://exemple.test/mcp", description="Le temps qu'il fait")


class Rpc:
    """Un serveur d'outils qui ne joint rien et retient ce qu'on lui demande."""

    def __init__(self, *answers: Any) -> None:
        self.answers = list(answers)
        self.calls: list[dict[str, Any]] = []

    async def __call__(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append({"url": url, "payload": payload})
        # La poignée de main précède toute demande utile : le serveur factice
        # y répond sans consommer la réponse suivante, sinon chaque test
        # devrait la déclarer et on testerait le test.
        if payload.get("method") in {"initialize", "notifications/initialized"}:
            return {"jsonrpc": "2.0", "id": 1, "result": {"protocolVersion": "2025-06-18"}}
        answer = self.answers.pop(0) if self.answers else {}
        if isinstance(answer, Exception):
            raise answer
        return answer

    @property
    def useful(self) -> list[dict[str, Any]]:
        """Les appels qui ne sont pas la poignée de main."""
        return [
            call
            for call in self.calls
            if call["payload"].get("method") not in {"initialize", "notifications/initialized"}
        ]


def listed(*tools: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": 1, "result": {"tools": list(tools)}}


def content(*parts: dict[str, Any], failed: bool = False) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": 1, "result": {"content": list(parts), "isError": failed}}


async def test_tools_are_discovered_not_declared() -> None:
    rpc = Rpc(
        listed({"name": "prevision", "description": "Le temps", "inputSchema": {"type": "object"}})
    )

    tools = await list_tools(METEO, transport=rpc)

    assert [tool.name for tool in tools] == ["prevision"]
    # Le schéma vient du serveur : nous ne le connaissions pas avant de demander.
    assert tools[0].input_schema == {"type": "object"}
    assert rpc.useful[0]["payload"]["method"] == "tools/list"


async def test_a_nameless_tool_is_dropped_rather_than_kept() -> None:
    rpc = Rpc(listed({"description": "sans nom"}, {"name": "vrai"}, "pas un outil"))

    tools = await list_tools(METEO, transport=rpc)

    assert [tool.name for tool in tools] == ["vrai"]


async def test_a_server_error_does_not_leak_its_message() -> None:
    rpc = Rpc({"jsonrpc": "2.0", "id": 1, "error": {"code": -32000, "message": "clé interne XYZ"}})

    with pytest.raises(McpRefusal) as refused:
        await list_tools(METEO, transport=rpc)

    assert "XYZ" not in refused.value.message
    assert "-32000" in refused.value.message


async def test_an_unreachable_server_is_a_refusal_not_a_crash() -> None:
    rpc = Rpc(RuntimeError("connexion refusée"))

    with pytest.raises(McpRefusal) as refused:
        await list_tools(METEO, transport=rpc)

    assert refused.value.status == 502


async def test_calling_a_tool_flattens_its_content_to_text() -> None:
    rpc = Rpc(content({"type": "text", "text": "18 °C"}, {"type": "text", "text": "vent faible"}))

    answer = await call_tool(METEO, "prevision", {"ville": "Paris"}, transport=rpc)

    assert answer["text"] == "18 °C\nvent faible"
    assert answer["failed"] is False
    assert rpc.useful[0]["payload"]["params"] == {
        "name": "prevision",
        "arguments": {"ville": "Paris"},
    }


async def test_an_embedded_text_resource_is_read() -> None:
    # The GitHub MCP server returns a file as an embedded resource, not as text:
    # dropping it made the agent say the README was unreadable (16 November 2026).
    rpc = Rpc(
        content(
            {"type": "text", "text": "successfully downloaded text file"},
            {
                "type": "resource",
                "resource": {
                    "uri": "repo://guillaume-flambard/usine/contents/deployment/README.md",
                    "mimeType": "text/markdown",
                    "text": "# Déploiement\nLa chaîne est arrêtée.",
                },
            },
        )
    )

    answer = await call_tool(METEO, "get_file_contents", {}, transport=rpc)

    assert "La chaîne est arrêtée." in answer["text"]
    assert "non textuel" not in answer["text"]


async def test_an_embedded_text_blob_is_decoded() -> None:
    import base64

    blob = base64.b64encode("ligne en UTF-8 : é".encode()).decode()
    rpc = Rpc(
        content(
            {"type": "resource", "resource": {"uri": "x", "mimeType": "text/plain", "blob": blob}}
        )
    )

    answer = await call_tool(METEO, "get_file_contents", {}, transport=rpc)

    assert answer["text"] == "ligne en UTF-8 : é"


async def test_a_binary_resource_is_still_named() -> None:
    rpc = Rpc(
        content(
            {
                "type": "resource",
                "resource": {"uri": "logo.png", "mimeType": "image/png", "blob": "iVBO"},
            }
        )
    )

    answer = await call_tool(METEO, "get_file_contents", {}, transport=rpc)

    assert "non textuel" in answer["text"]
    assert "logo.png" in answer["text"]


async def test_a_non_textual_part_is_named_rather_than_dropped() -> None:
    # Un agent qui ne sait pas qu'une image est revenue croirait l'outil muet.
    rpc = Rpc(content({"type": "image", "data": "..."}))

    answer = await call_tool(METEO, "carte", {}, transport=rpc)

    assert "non textuel" in answer["text"]


async def test_a_tool_that_failed_is_distinguished_from_a_server_that_failed() -> None:
    # MCP dit qu'un outil a échoué sans que l'appel ait échoué. Le distinguer
    # laisse à un agent la possibilité de réessayer autrement.
    rpc = Rpc(content({"type": "text", "text": "ville inconnue"}, failed=True))

    answer = await call_tool(METEO, "prevision", {"ville": "nulle part"}, transport=rpc)

    assert answer["failed"] is True
    assert answer["text"] == "ville inconnue"


async def test_a_huge_result_is_bounded_and_says_so() -> None:
    rpc = Rpc(content({"type": "text", "text": "x" * (MAX_RESULT_BYTES + 50)}))

    answer = await call_tool(METEO, "tout", {}, transport=rpc)

    assert len(answer["text"]) == MAX_RESULT_BYTES
    assert answer["truncated"] is True


def client_for(rpc: Any, servers: dict[str, Server] | None = None) -> TestClient:
    return TestClient(
        create_app(key="clé", call=None, servers=servers or {"meteo": METEO}, transport=rpc)
    )


def test_the_route_lists_what_the_servers_offer() -> None:
    client = client_for(Rpc(listed({"name": "prevision"})))

    body = client.get("/tools").json()

    assert body["tools"][0]["server"] == "meteo"
    assert body["unreachable"] == []


def test_a_mute_server_does_not_silence_the_others() -> None:
    autre = Server(name="autre", url="https://autre.test/mcp")
    # Le premier serveur tombe, le second répond.
    rpc = Rpc(RuntimeError("coupé"), listed({"name": "vrai"}))
    client = client_for(rpc, {"meteo": METEO, "autre": autre})

    body = client.get("/tools").json()

    assert [tool["name"] for tool in body["tools"]] == ["vrai"]
    assert body["unreachable"] == ["meteo"]


def test_an_unknown_server_is_refused_and_says_what_exists() -> None:
    client = client_for(Rpc())

    response = client.post("/tools/inconnu/prevision", json={"arguments": {}})

    assert response.status_code == 400
    assert "meteo" in response.json()["error"]


def test_the_browser_never_names_an_address() -> None:
    # Un agent nomme un serveur ; l'adresse n'existe que côté service. Même
    # règle que les sources, et pour la même raison.
    rpc = Rpc(content({"type": "text", "text": "18 °C"}))
    client = client_for(rpc)

    client.post("/tools/meteo/prevision", json={"arguments": {"ville": "Paris"}})

    assert rpc.calls[0]["url"] == METEO.url


async def test_the_handshake_precedes_any_useful_call() -> None:
    # Un serveur conforme refuse `tools/list` sans elle. L'omettre marchait
    # contre les serveurs indulgents et échouait contre les autres.
    rpc = Rpc(listed({"name": "prevision"}))

    await list_tools(METEO, transport=rpc)

    assert [call["payload"].get("method") for call in rpc.calls[:2]] == [
        "initialize",
        "notifications/initialized",
    ]
    # La notification ne porte pas d'identifiant : rien n'y répond.
    assert "id" not in rpc.calls[1]["payload"]
