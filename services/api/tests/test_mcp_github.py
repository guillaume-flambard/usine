"""The GitHub tool server, end to end over real HTTP (MEM-82).

The usine's whitelist names GitHub's official MCP server
(https://github.com/github/github-mcp-server). These tests do not call GitHub:
a local HTTP server speaks the same protocol the way GitHub's does, which is
what the earlier fake transports did not:

- it answers in Server-Sent Events, as streamable HTTP allows and as FastMCP
  and GitHub do. The real transport only read JSON, so every real answer read
  as « répondu sans résultat » while every test passed;
- it requires `Authorization: Bearer`, read from the variable the whitelist
  names (`token_env`). The real transport never sent it;
- it hands out a session at the handshake and refuses calls without it.

The tool schemas below are the ones GitHub's server listed on 16 November 2026
(`tools/list`), trimmed to the fields the usine uses.
"""

from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, ClassVar

import pytest

from usine_api.app import http_rpc
from usine_api.contracts import ProposedAction
from usine_api.mcp import Server, forget_session, parse_body
from usine_api.mcp_registry import AllowedTool, Registered, Registry
from usine_api.mcp_tools import McpExecutor, toolbox
from usine_api.models import ModelSettings
from usine_api.specialists.pydantic_verdict import PydanticVerdictSpecialist

TOKEN = "test-token-not-a-secret"
SESSION = "s-github"

GITHUB_TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_file_contents",
        "description": "Get the contents of a file or directory from a GitHub repository",
        "inputSchema": {
            "type": "object",
            "properties": {
                "owner": {"type": "string", "description": "Repository owner"},
                "repo": {"type": "string", "description": "Repository name"},
                "path": {"type": "string", "description": "Path to file/directory"},
                "fields": {"type": "array", "items": {"type": "object"}},
            },
            "required": ["owner", "repo"],
        },
    },
    {
        "name": "issue_write",
        "description": "Create a new or update an existing issue in a GitHub repository.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "method": {"type": "string", "enum": ["create", "update"]},
                "owner": {"type": "string"},
                "repo": {"type": "string"},
                "title": {"type": "string"},
                "body": {"type": "string"},
                "labels": {"type": "array", "items": {"type": "string"}},
                # An optional array of objects: left out of the agent's
                # arguments, it must not cost the whole tool.
                "issue_fields": {"type": "array", "items": {"type": "object"}},
            },
            "required": ["method", "owner", "repo"],
        },
    },
    # Offered by the server, not named by the whitelist: never exposed.
    {
        "name": "delete_file",
        "description": "Delete a file",
        "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}}},
    },
]


class _GitHubLikeHandler(BaseHTTPRequestHandler):
    """Speaks MCP like GitHub's server: SSE answers, bearer and session required."""

    calls: ClassVar[list[dict[str, Any]]] = []

    def log_message(self, *args: Any) -> None:
        return

    def _sse(self, body: dict[str, Any], headers: dict[str, str] | None = None) -> None:
        # A notification first, then the response: the reader must pick the
        # JSON-RPC response, not the first event.
        notice = {"jsonrpc": "2.0", "method": "notifications/message", "params": {}}
        raw = (
            f"event: message\ndata: {json.dumps(notice)}\n\n"
            f"event: message\ndata: {json.dumps(body)}\n\n"
        ).encode()
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("content-length", str(len(raw)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(raw)

    def _status(self, status: int) -> None:
        self.send_response(status)
        self.send_header("content-length", "0")
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("content-length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        if self.headers.get("authorization") != f"Bearer {TOKEN}":
            self._status(401)
            return
        method = payload.get("method")
        rid = payload.get("id")
        if method == "initialize":
            self._sse(
                {"jsonrpc": "2.0", "id": rid, "result": {"protocolVersion": "2025-06-18"}},
                {"Mcp-Session-Id": SESSION},
            )
            return
        if method == "notifications/initialized":
            self._status(202)
            return
        if self.headers.get("mcp-session-id") != SESSION:
            self._status(400)
            return
        if method == "tools/list":
            self._sse({"jsonrpc": "2.0", "id": rid, "result": {"tools": GITHUB_TOOLS}})
            return
        if method == "tools/call":
            params = payload["params"]
            type(self).calls.append(params)
            if params["name"] == "issue_write":
                text = json.dumps({"number": 101, "url": "https://github.com/o/r/issues/101"})
            else:
                text = "# usine\nle README"
            self._sse(
                {
                    "jsonrpc": "2.0",
                    "id": rid,
                    "result": {"content": [{"type": "text", "text": text}]},
                }
            )
            return
        self._status(400)


@pytest.fixture
def github_url() -> Iterator[str]:
    _GitHubLikeHandler.calls = []
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _GitHubLikeHandler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{httpd.server_address[1]}/mcp/"
    forget_session(url)
    yield url
    forget_session(url)
    httpd.shutdown()


def _registry(url: str) -> Registry:
    return Registry(
        {
            "github": Registered(
                name="github",
                url=url,
                description="les dépôts GitHub suivis par l'usine",
                token_env="USINE_TEST_GITHUB_TOKEN",
                tools=(
                    AllowedTool(name="get_file_contents", risk="read"),
                    AllowedTool(name="issue_write", risk="irreversible"),
                ),
            )
        }
    )


def test_a_json_answer_is_read_as_is() -> None:
    body = parse_body("application/json", '{"jsonrpc": "2.0", "id": 1, "result": {}}')
    assert body == {"jsonrpc": "2.0", "id": 1, "result": {}}


def test_an_sse_answer_yields_the_json_rpc_response_not_a_notification() -> None:
    stream = (
        'event: message\ndata: {"jsonrpc": "2.0", "method": "notifications/progress"}\n\n'
        'event: message\ndata: {"jsonrpc": "2.0", "id": 1, "result": {"tools": []}}\n\n'
    )
    assert parse_body("text/event-stream", stream) == {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {"tools": []},
    }


def test_garbage_reads_as_an_empty_answer() -> None:
    assert parse_body("application/json", "<html>") == {}
    assert parse_body("text/event-stream", "data: <html>\n\n") == {}


async def test_without_its_token_the_server_is_unavailable(
    github_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("USINE_TEST_GITHUB_TOKEN", raising=False)
    box = await toolbox(_registry(github_url), transport=http_rpc)
    assert box.tools == []
    assert [item.server for item in box.unavailable] == ["github"]


async def test_the_real_transport_discovers_and_calls_over_sse_with_the_token(
    github_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("USINE_TEST_GITHUB_TOKEN", TOKEN)
    box = await toolbox(_registry(github_url), transport=http_rpc)

    assert sorted(t.name for t in box.tools) == [
        "github__get_file_contents",
        "github__issue_write",
    ]
    read = next(t for t in box.tools if t.name == "github__get_file_contents")
    answer = await read.ainvoke({"owner": "o", "repo": "r", "path": "README.md"})

    assert "le README" in answer
    # An unset optional is not sent as null.
    assert _GitHubLikeHandler.calls == [
        {
            "name": "get_file_contents",
            "arguments": {"owner": "o", "repo": "r", "path": "README.md"},
        }
    ]


async def test_an_irreversible_tool_proposes_and_reaches_nothing(
    github_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("USINE_TEST_GITHUB_TOKEN", TOKEN)
    box = await toolbox(_registry(github_url), transport=http_rpc)
    write = next(t for t in box.tools if t.name == "github__issue_write")

    answer = await write.ainvoke(
        {"method": "create", "owner": "o", "repo": "r", "title": "Le build est arrêté"}
    )

    assert "rien n'a été exécuté" in answer
    assert _GitHubLikeHandler.calls == []
    [proposal] = box.proposals
    assert proposal.target == "github/issue_write"
    assert proposal.kind == "external_write"
    assert json.loads(proposal.preview) == {
        "method": "create",
        "owner": "o",
        "repo": "r",
        "title": "Le build est arrêté",
    }


async def test_an_approved_action_runs_with_the_arguments_the_person_approved(
    github_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("USINE_TEST_GITHUB_TOKEN", TOKEN)
    executor = McpExecutor(_registry(github_url), transport=http_rpc)
    edited = {"method": "create", "owner": "o", "repo": "r", "title": "Titre corrigé"}

    outcome = await executor.execute(
        ProposedAction(
            kind="external_write",
            target="github/issue_write",
            justification="l'agent a demandé un outil irréversible",
            preview=json.dumps(edited),
        )
    )

    assert outcome.startswith("exécutée : ")
    assert "issues/101" in outcome
    assert _GitHubLikeHandler.calls == [{"name": "issue_write", "arguments": edited}]


@pytest.mark.parametrize(
    ("target", "preview", "said"),
    [
        ("github/get_file_contents", "{}", "ne passe pas par la porte"),
        ("github/delete_file", "{}", "outil non autorisé"),
        ("ailleurs/issue_write", "{}", "serveur inconnu"),
        ("github/issue_write", "titre: x", "pas du JSON"),
        ("github/issue_write", "[1, 2]", "pas un objet JSON"),
    ],
)
async def test_the_executor_runs_only_gated_tools_with_json_arguments(
    github_url: str, monkeypatch: pytest.MonkeyPatch, target: str, preview: str, said: str
) -> None:
    monkeypatch.setenv("USINE_TEST_GITHUB_TOKEN", TOKEN)
    executor = McpExecutor(_registry(github_url), transport=http_rpc)

    outcome = await executor.execute(
        ProposedAction(kind="external_write", target=target, justification="j", preview=preview)
    )

    assert outcome.startswith("non exécutée : ")
    assert said in outcome
    assert _GitHubLikeHandler.calls == []


def test_the_versioned_whitelist_gates_every_issue_write() -> None:
    config = Path(__file__).resolve().parents[3] / "config" / "mcp-servers.yaml"
    registry = Registry.load(config)

    github = registry.resolve("github")
    assert github.url == "https://api.githubcopilot.com/mcp/"
    assert github.token_env == "USINE_GITHUB_TOKEN"
    assert registry.allowed("github", "issue_write") == "irreversible"
    assert registry.allowed("github", "get_file_contents") == "read"


async def test_pydantic_ai_discovers_the_github_tools_over_real_http(
    github_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("USINE_TEST_GITHUB_TOKEN", TOKEN)
    _registry(github_url)  # registers the token variable for this URL
    settings = ModelSettings(base_url="http://x/v1", api_key="k", model="m")
    specialist = PydanticVerdictSpecialist(
        settings,
        mcp_servers=(Server(name="github", url=github_url),),
        transport=http_rpc,
    )

    tools = await specialist._discover_mcp_tools()

    names = [getattr(t, "__name__", str(t)) for t in tools]
    assert "get_file_contents" in names


def test_a_server_with_the_labs_token_never_answers_an_anonymous_visitor(
    github_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Even with the atelier open (development), the token is not a public proxy."""
    from fastapi.testclient import TestClient

    from usine_api.app import create_app

    monkeypatch.setenv("USINE_TEST_GITHUB_TOKEN", TOKEN)
    app = create_app(registry=_registry(github_url), open_atelier=True)
    with TestClient(app) as client:
        reply = client.post(
            "/tools/github/get_file_contents", json={"arguments": {"owner": "o", "repo": "r"}}
        )
    assert reply.status_code == 401
    assert _GitHubLikeHandler.calls == []


def test_tools_are_reachable_only_once_their_token_is_set() -> None:
    from usine_api.mcp_registry import tools_reachable

    registry = _registry("http://127.0.0.1:1/mcp/")
    assert tools_reachable(registry, {}) is False
    assert tools_reachable(registry, {"USINE_TEST_GITHUB_TOKEN": TOKEN}) is True
    keyless = Registry(
        {
            "docs": Registered(
                name="docs",
                url="http://127.0.0.1:1/mcp/",
                description="d",
                token_env=None,
                tools=(),
            )
        }
    )
    assert tools_reachable(keyless, {}) is True


@pytest.mark.parametrize(("token", "default"), [(TOKEN, "mcp-agent"), (None, "chat-model")])
def test_the_tool_agent_is_the_default_once_github_is_reachable(
    monkeypatch: pytest.MonkeyPatch, token: str | None, default: str
) -> None:
    """Without tools an agent cannot read the repository: it answers beside the point."""
    from fastapi.testclient import TestClient

    from usine_api.app import create_app

    monkeypatch.setenv("LITELLM_BASE_URL", "http://127.0.0.1:1/v1")
    monkeypatch.setenv("LITELLM_API_KEY", "test-key-not-a-secret")
    monkeypatch.delenv("USINE_CASSETTE", raising=False)
    if token:
        monkeypatch.setenv("USINE_TEST_GITHUB_TOKEN", token)
    else:
        monkeypatch.delenv("USINE_TEST_GITHUB_TOKEN", raising=False)
    app = create_app(registry=_registry("http://127.0.0.1:1/mcp/"), open_atelier=True)
    with TestClient(app) as client:
        body = client.get("/api/specialists").json()
    assert body["default"] == default
