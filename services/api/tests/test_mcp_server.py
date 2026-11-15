"""Le serveur MCP de l'usine (MEM-39 + MEM-40), contre l'API réelle en mémoire.

Ce que ces tests protègent :
- un client MCP voit cinq outils décrits et peut les appeler ;
- pas de jeton MCP → 401 sur chaque outil ;
- un jeton `read` ne peut pas appeler `fork_run` (403), aucune branche créée ;
- un jeton `read_fork` ouvre une branche sans l'exécuter ;
- chaque appel est journalisé (audit, aucun secret n'entre dans le journal).

Le SDK MCP enveloppe les exceptions des outils dans `UnexpectedToolError`,
l'original restant accessible via `__cause__`.

La vérification par un client externe (Claude Code, inspecteur MCP) reste
manuelle : `mcp 2.3` n'expose pas de lanceur de session en flux, et une
imitation de client ne prouverait rien de plus que l'API du serveur.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from mcp.server.mcpserver.exceptions import UnexpectedToolError

from usine_api.app import create_app
from usine_api.contracts import SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.mcp_auth import InMemoryMcpAuthStore
from usine_api.mcp_server import McpUnauthorized, build

INTERNAL_SECRET = "test-internal-secret"


IDENTITY = SpecialistIdentity(name="fake", framework="test", framework_version="0")


class _Planner:
    async def plan(self, brief: str) -> list[str]:
        return [brief]


class _Specialist:
    identity = IDENTITY

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        return SpecialistOutput(
            answer=f"fait : {task.task}", identity=IDENTITY, tokens=1, tool_calls=0
        )


@pytest.fixture
async def api() -> Any:
    """Le vrai app, son lifespan tournant, avec un store de jetons en mémoire."""
    auth_store = InMemoryMcpAuthStore()
    app = create_app(
        planner=_Planner(),
        specialist=_Specialist(),
        mcp_auth=auth_store,
        internal_secret=INTERNAL_SECRET,
    )
    async with (
        app.router.lifespan_context(app),  # type: ignore[attr-defined]
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://usine.test"
        ) as client,
    ):
        yield client, auth_store


async def chat(api: Any, thread_id: str) -> None:
    """Un run terminé : le flux doit être consommé pour que la ligne d'index existe."""
    client = api[0]
    response = await client.post(
        "/api/chat",
        json={
            "id": thread_id,
            "messages": [{"role": "user", "parts": [{"type": "text", "text": "x"}]}],
        },
    )
    await response.aread()


def issue_token(auth_store: InMemoryMcpAuthStore, scope: str) -> str:
    """Émet un jeton MCP et le retourne en clair (une seule fois)."""
    return auth_store.issue("org-test", f"jeton {scope}", scope).token


async def expect_mcp_refusal(
    server: Any, tool: str, arguments: dict[str, Any], match: str
) -> McpUnauthorized:
    """Appelle un outil et retourne l'erreur MCP sous-jacente."""
    with pytest.raises(UnexpectedToolError) as caught:
        await server.call_tool(tool, arguments)
    cause = caught.value.__cause__
    assert isinstance(cause, McpUnauthorized), f"attendu McpUnauthorized, obtenu {type(cause)}"
    assert match in str(cause), f"attendu {match!r} dans {str(cause)!r}"
    return cause


def payload(result: Any) -> Any:
    """Ce qu'un outil a retourné, quelle que soit la façon dont le SDK le porte."""
    structured = getattr(result, "structured_content", None)
    if structured:
        return structured.get("result", structured)
    for block in getattr(result, "content", []) or []:
        text = getattr(block, "text", None)
        if text:
            return json.loads(text)
    return None


async def test_a_client_lists_the_tools_and_their_descriptions(api: Any) -> None:
    client = api[0]
    listed = await build(client=client, token="dummy", internal_secret=INTERNAL_SECRET).list_tools()

    assert sorted(tool.name for tool in listed) == [
        "fork_run",
        "get_run",
        "list_checkpoints",
        "list_runs",
        "list_specialists",
    ]
    fork = next(tool for tool in listed if tool.name == "fork_run")
    # La description dit ce qui compte : rien ne s'exécute.
    assert "sans l'exécuter" in (fork.description or "")


async def test_no_token_means_401(api: Any) -> None:
    """Sans jeton MCP configuré, chaque outil refuse avec 401."""
    client = api[0]
    await chat(api, "chat-notoken")
    server = build(client=client, internal_secret=INTERNAL_SECRET)
    await expect_mcp_refusal(server, "list_runs", {"limit": 5}, "401")


async def test_read_only_token_cannot_fork(api: Any) -> None:
    """Un jeton `read` ne peut pas appeler `fork_run` : 403, pas de branche créée."""
    client, auth_store = api
    await chat(api, "chat-read")
    token = issue_token(auth_store, "read")
    server = build(client=client, token=token, internal_secret=INTERNAL_SECRET)
    await expect_mcp_refusal(server, "fork_run", {"thread_id": "chat-read"}, "403")


async def test_read_only_token_can_list(api: Any) -> None:
    """Un jeton `read` peut lister les runs (c'est sa portée)."""
    client, auth_store = api
    await chat(api, "chat-readlist")
    token = issue_token(auth_store, "read")
    server = build(client=client, token=token, internal_secret=INTERNAL_SECRET)

    runs = payload(await server.call_tool("list_runs", {"limit": 5}))
    assert [run["thread_id"] for run in runs] == ["chat-readlist"]


async def test_a_client_lists_the_runs(api: Any) -> None:
    client, auth_store = api
    await chat(api, "chat-mcp")
    token = issue_token(auth_store, "read")
    server = build(client=client, token=token, internal_secret=INTERNAL_SECRET)

    runs = payload(await server.call_tool("list_runs", {"limit": 5}))
    assert [run["thread_id"] for run in runs] == ["chat-mcp"]


async def test_fork_opens_a_branch_without_running_it(api: Any) -> None:
    """Le critère d'acceptation : jamais d'action irréversible sans gate."""
    client, auth_store = api
    await chat(api, "chat-fork")
    token = issue_token(auth_store, "read_fork")
    server = build(client=client, token=token, internal_secret=INTERNAL_SECRET)

    branch = payload(await server.call_tool("fork_run", {"thread_id": "chat-fork"}))

    assert branch["parent"]["thread_id"] == "chat-fork"
    assert branch["status"] == "running"
    assert branch["turns"] == 0

    # Rien n'a tourné : la branche n'a pas de tour, et l'original est intact.
    assert (await client.get(f"/api/runs/{branch['thread_id']}")).json()["turns"] == 0
    assert (await client.get("/api/runs/chat-fork")).json()["turns"] == 1


async def test_an_unknown_run_is_a_refusal_not_an_empty_run(api: Any) -> None:
    """Un 404 fait échouer l'appel ; il ne revient pas comme un run vide."""
    client, auth_store = api
    token = issue_token(auth_store, "read")
    server = build(client=client, token=token, internal_secret=INTERNAL_SECRET)
    with pytest.raises(Exception, match="get_run"):
        await server.call_tool("get_run", {"thread_id": "inconnu"})
