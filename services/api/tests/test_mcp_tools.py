"""Les outils MCP dans le graphe (MEM-38), sans réseau.

Ce que ces tests protègent : un outil découvert à l'exécution devient appelable,
un outil irréversible ne s'exécute jamais (il propose), un serveur muet
n'arrête pas le run, et chaque appel est borné par un délai.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from usine_api.contracts import Budget, SpecialistInput
from usine_api.mcp_registry import Registry
from usine_api.mcp_tools import toolbox

CONFIG = """
servers:
  - name: docs
    url: https://mcp.exemple.test/docs
    tools:
      search: read
      publish: irreversible
"""


def registry(tmp_path: Path) -> Registry:
    path = tmp_path / "mcp-servers.yaml"
    path.write_text(CONFIG, encoding="utf-8")
    return Registry.load(path)


class FakeTransport:
    """A server that answers tools/list and tools/call, and records the calls."""

    def __init__(self, *, tools: list[dict[str, Any]] | None = None, slow: bool = False) -> None:
        self.calls: list[dict[str, Any]] = []
        self.tools = tools if tools is not None else [SEARCH, PUBLISH, SECRET]
        self.slow = slow

    async def __call__(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(payload)
        if self.slow and payload["method"] == "tools/list":
            await asyncio.sleep(1)
        if payload["method"] == "initialize":
            return {"result": {"protocolVersion": "2025-06-18"}}
        if payload["method"] == "tools/list":
            return {"result": {"tools": self.tools}}
        if payload["method"] == "tools/call":
            name = payload["params"]["name"]
            return {"result": {"content": [{"type": "text", "text": f"{name} a répondu"}]}}
        return {"result": {}}


SEARCH = {
    "name": "search",
    "description": "cherche dans la documentation",
    "inputSchema": {
        "type": "object",
        "properties": {"query": {"type": "string", "description": "la recherche"}},
        "required": ["query"],
    },
}
PUBLISH = {
    "name": "publish",
    "description": "publie une annonce",
    "inputSchema": {
        "type": "object",
        "properties": {"texte": {"type": "string"}},
        "required": ["texte"],
    },
}
SECRET = {
    "name": "delete_all",
    "description": "efface tout",
    "inputSchema": {"type": "object", "properties": {}},
}


async def test_an_unknown_tool_is_discovered_at_run_time(tmp_path: Path) -> None:
    """The agent learns a tool it was never compiled with, and can call it."""
    box = await toolbox(registry(tmp_path), transport=FakeTransport())

    names = [tool.name for tool in box.tools]
    assert "docs__search" in names
    # Proposed by the server, never named by us: it does not exist for the agent.
    assert "docs__delete_all" not in names

    search = next(tool for tool in box.tools if tool.name == "docs__search")
    assert (await search.ainvoke({"query": "portes"})).strip() == "search a répondu"


async def test_an_irreversible_tool_never_runs(tmp_path: Path) -> None:
    transport = FakeTransport()
    box = await toolbox(registry(tmp_path), transport=transport)

    publish = next(tool for tool in box.tools if tool.name == "docs__publish")
    answer = await publish.ainvoke({"texte": "la v2 est sortie"})

    assert "irréversible" in answer
    # Nothing was called on the server: it only proposes.
    assert not [call for call in transport.calls if call["method"] == "tools/call"]
    assert len(box.proposals) == 1
    assert box.proposals[0].target == "docs/publish"
    assert "la v2 est sortie" in box.proposals[0].preview


async def test_an_unreachable_server_does_not_stop_the_run(tmp_path: Path) -> None:
    class Silent(FakeTransport):
        async def __call__(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
            if payload["method"] == "tools/list":
                raise TimeoutError
            return await super().__call__(url, payload)

    box = await toolbox(registry(tmp_path), transport=Silent())
    assert box.tools == []
    assert box.unavailable and box.unavailable[0].server == "docs"
    assert box.unavailable[0].reason


async def test_a_call_is_bounded_in_time(tmp_path: Path) -> None:
    class Hanging(FakeTransport):
        async def __call__(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
            if payload["method"] == "tools/call":
                await asyncio.sleep(1)
            return await super().__call__(url, payload)

    box = await toolbox(registry(tmp_path), transport=Hanging(), timeout=0.05)
    search = next(tool for tool in box.tools if tool.name == "docs__search")
    assert "n'a pas répondu" in await search.ainvoke({"query": "x"})


async def test_the_toolbox_says_what_it_holds(tmp_path: Path) -> None:
    box = await toolbox(registry(tmp_path), transport=FakeTransport())
    summary = box.summary()
    assert "docs__search" in summary["tools"]
    assert summary["unavailable"] == []


async def test_the_agent_uses_a_tool_and_reports_it(tmp_path: Path) -> None:
    """The whole chain: an MCP tool, the agent, and the trace of the call."""
    import httpx

    from usine_api.models import ModelSettings
    from usine_api.specialists.mcp_agent import McpAgentSpecialist

    replies = [
        {
            "id": "c1",
            "object": "chat.completion",
            "created": 0,
            "model": "lab-fast",
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "tool_calls",
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "docs__search",
                                    "arguments": json.dumps({"query": "portes"}),
                                },
                            }
                        ],
                    },
                }
            ],
            "usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7},
        },
        {
            "id": "c2",
            "object": "chat.completion",
            "created": 0,
            "model": "lab-fast",
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "stop",
                    "message": {"role": "assistant", "content": "La réponse, outil compris."},
                }
            ],
            "usage": {"prompt_tokens": 9, "completion_tokens": 4, "total_tokens": 13},
        },
    ]

    def gateway(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=replies.pop(0) if len(replies) > 1 else replies[0])

    settings = ModelSettings(base_url="http://litellm.test/v1", api_key="sk-test", model="lab-fast")
    transport = FakeTransport()
    specialist = McpAgentSpecialist(
        settings,
        registry=registry(tmp_path),
        transport=transport,
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(gateway)),
    )

    output = await specialist.run(
        SpecialistInput(
            task="cherche les portes",
            budget=Budget(max_tokens=500, max_seconds=10, max_tool_calls=3),
        )
    )

    assert output.answer == "La réponse, outil compris."
    assert output.tools == ("docs__search",)
    assert output.tool_calls == 1
    assert output.tokens == 20  # 7 + 13, from the two model calls
    assert [
        call["params"]["name"] for call in transport.calls if call["method"] == "tools/call"
    ] == ["search"]
