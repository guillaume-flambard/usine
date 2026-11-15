"""Le serveur MCP de l'usine (MEM-39), contre l'API réelle en mémoire.

Les outils sont appelés par l'API du serveur (`list_tools`, `call_tool`), celle
que le SDK utilise sous le protocole. Le câblage d'une session cliente en mémoire
n'est pas repris ici : `mcp 2.3` n'expose pas de lanceur sur flux, et la
vérification par un client externe (Claude Code, inspecteur MCP) est décrite
dans le README plutôt que simulée — une imitation de client ne prouverait rien
de plus que l'API du serveur.

Ce que ces tests protègent : un client voit cinq outils décrits, il liste les
runs, et `fork_run` ouvre une branche **sans l'exécuter**.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from usine_api.app import create_app
from usine_api.contracts import SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.mcp_server import build

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
    """The real app, its lifespan running: without it there is no chat graph."""
    app = create_app(planner=_Planner(), specialist=_Specialist())
    async with (
        app.router.lifespan_context(app),  # type: ignore[attr-defined]
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://usine.test"
        ) as client,
    ):
        yield client


def payload(result: Any) -> Any:
    """What a tool returned: the SDK's structured content, else its text."""
    structured = getattr(result, "structured_content", None)
    if structured:
        return structured.get("result", structured)
    for block in getattr(result, "content", []) or []:
        text = getattr(block, "text", None)
        if text:
            return json.loads(text)
    return None


async def chat(api: httpx.AsyncClient, thread_id: str) -> None:
    """A finished run: the stream must be consumed for the index row to exist."""
    response = await api.post(
        "/api/chat",
        json={
            "id": thread_id,
            "messages": [{"role": "user", "parts": [{"type": "text", "text": "x"}]}],
        },
    )
    await response.aread()


async def test_a_client_lists_the_tools_and_their_descriptions(api: httpx.AsyncClient) -> None:
    listed = await build(client=api).list_tools()

    assert sorted(tool.name for tool in listed) == [
        "fork_run",
        "get_run",
        "list_checkpoints",
        "list_runs",
        "list_specialists",
    ]
    fork = next(tool for tool in listed if tool.name == "fork_run")
    # The description says the thing that matters: nothing runs.
    assert "sans l'exécuter" in (fork.description or "")


async def test_a_client_lists_the_runs(api: httpx.AsyncClient) -> None:
    await chat(api, "chat-mcp")
    server = build(client=api)

    runs = payload(await server.call_tool("list_runs", {"limit": 5}))

    assert [run["thread_id"] for run in runs] == ["chat-mcp"]


async def test_fork_opens_a_branch_without_running_it(api: httpx.AsyncClient) -> None:
    """The acceptance criterion: never an irreversible action without a gate."""
    await chat(api, "chat-fork")
    server = build(client=api)

    branch = payload(await server.call_tool("fork_run", {"thread_id": "chat-fork"}))

    assert branch["parent"]["thread_id"] == "chat-fork"
    assert branch["status"] == "running"
    assert branch["turns"] == 0

    # Nothing ran: the branch has no turn, and the original is untouched.
    assert (await api.get(f"/api/runs/{branch['thread_id']}")).json()["turns"] == 0
    assert (await api.get("/api/runs/chat-fork")).json()["turns"] == 1


async def test_an_unknown_run_is_a_refusal_not_an_empty_run(api: httpx.AsyncClient) -> None:
    """A 404 fails the call; it does not come back as an empty run.

    The SDK wraps the message (`Error executing tool get_run`), so the status
    itself is asserted where it is set: the exception the tool raises carries it
    before the SDK replaces the text.
    """
    server = build(client=api)
    with pytest.raises(Exception, match="get_run"):
        await server.call_tool("get_run", {"thread_id": "inconnu"})
