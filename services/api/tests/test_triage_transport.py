"""One token per GitHub account: the triage's own MCP transport (ADR 0003)."""

from __future__ import annotations

import json

import httpx

from usine_api.triage.transport import TokenTransport

URL = "https://api.githubcopilot.com/mcp/"


async def test_each_transport_sends_its_own_token_and_keeps_its_own_session() -> None:
    seen: list[dict[str, str]] = []

    def reply(request: httpx.Request) -> httpx.Response:
        seen.append(dict(request.headers))
        token = request.headers["authorization"].removeprefix("Bearer ")
        return httpx.Response(
            200,
            json={"jsonrpc": "2.0", "id": 1, "result": {"ok": True}},
            headers={"mcp-session-id": f"session-of-{token}"},
        )

    mock = httpx.MockTransport(reply)
    gf = TokenTransport("t-gf", http=mock)
    md = TokenTransport("t-md", http=mock)
    assert await gf(URL, {"jsonrpc": "2.0", "id": 1, "method": "initialize"}) == {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {"ok": True},
    }
    await md(URL, {"jsonrpc": "2.0", "id": 1, "method": "initialize"})
    await gf(URL, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    assert [h["authorization"] for h in seen] == ["Bearer t-gf", "Bearer t-md", "Bearer t-gf"]
    # The second call of a transport proves its own session, never the other's.
    assert "mcp-session-id" not in seen[0] and "mcp-session-id" not in seen[1]
    assert seen[2]["mcp-session-id"] == "session-of-t-gf"


async def test_an_event_stream_answer_is_read() -> None:
    body = 'event: message\ndata: {"jsonrpc": "2.0", "id": 1, "result": {"n": 1}}\n\n'

    def reply(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["method"] == "tools/call"
        return httpx.Response(200, text=body, headers={"content-type": "text/event-stream"})

    transport = TokenTransport("t", http=httpx.MockTransport(reply))
    answer = await transport(URL, {"jsonrpc": "2.0", "id": 1, "method": "tools/call"})
    assert answer["result"] == {"n": 1}


def test_no_token_means_no_triage_and_one_token_is_enough() -> None:
    from pathlib import Path

    from usine_api.mcp_registry import Registry
    from usine_api.models import ModelSettings
    from usine_api.triage.service import default_triage

    root = Path(__file__).parents[3] / "config"
    options = {
        "gateway": ModelSettings(base_url="http://gateway.test", api_key="k", model="m"),
        "registry": Registry.load(root / "mcp-servers.yaml"),
        "policy_path": root / "triage.yaml",
    }
    # The chat's narrow token does not start a triage: only the triage's own do.
    assert default_triage(env={"USINE_GITHUB_TOKEN": "chat"}, **options) is None
    assert default_triage(env={"USINE_TRIAGE_TOKEN_MEMOLABS_DEV": "t"}, **options) is not None
    assert (
        default_triage(env={"USINE_TRIAGE_TOKEN_MEMOLABS_DEV": "t"}, **{**options, "gateway": None})
        is None
    )


def test_a_postgres_token_store_issues_without_migrating_mid_request() -> None:
    # Found on 17 November 2026: `issue` called `migrate(conn)` with a connection
    # where `migrate` wants the pool, so issuing a token crashed in production.
    from contextlib import contextmanager
    from typing import Any

    from usine_api.mcp_auth import PostgresMcpAuthStore

    class Row:
        def fetchone(self) -> tuple[str]:
            return ("id-1",)

    class Conn:
        def __init__(self) -> None:
            self.sql: list[str] = []

        def execute(self, sql: str, params: Any = None) -> Row:
            self.sql.append(sql)
            return Row()

    conn = Conn()

    class Pool:
        @contextmanager
        def connection(self) -> Any:
            yield conn

    secret = PostgresMcpAuthStore(Pool()).issue("org-a", "timer", "triage")  # type: ignore[arg-type]
    assert secret.scope == "triage" and secret.token
    assert len(conn.sql) == 1 and conn.sql[0].startswith("INSERT INTO mcp_tokens")
