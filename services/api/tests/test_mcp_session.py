"""La session MCP, contre un vrai serveur HTTP (MEM-41).

FastMCP — donc le serveur de l'usine, MEM-39 — annonce une session à la poignée
de main et refuse ensuite ce qui ne la porte pas. Ce test parle à un serveur
local qui se comporte ainsi : sans la gestion de session, la poignée de main
réussirait et `tools/list` échouerait, ce qui est exactement le piège.

Le serveur est un `http.server` de la bibliothèque standard : pas de dépendance,
et il ne peut pas mentir sur ce qu'il exige.
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import pytest

from usine_api.app import http_rpc
from usine_api.mcp import Server, call_tool, forget_session, list_tools

SESSION = "s-123"

TOOLS = [
    {
        "name": "search",
        "description": "cherche dans le corpus",
        "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}},
    }
]


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *args: Any) -> None:  # keep the test output quiet
        return

    def do_POST(self) -> None:  # noqa: N802 - http.server's name
        length = int(self.headers.get("content-length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        method = payload.get("method")
        session = self.headers.get("mcp-session-id")

        if method == "initialize":
            body = {
                "jsonrpc": "2.0",
                "id": payload.get("id"),
                "result": {"protocolVersion": "2025-06-18", "serverInfo": {"name": "faux"}},
            }
            return self._send(body, {"Mcp-Session-Id": SESSION})
        if method == "notifications/initialized":
            return self._send({}, {}, status=202)
        if session != SESSION:
            # The trap: a stateful server answers nothing without its session.
            return self._send({"error": {"code": -32000, "message": "no session"}}, status=400)
        if method == "tools/list":
            return self._send(
                {"jsonrpc": "2.0", "id": payload.get("id"), "result": {"tools": TOOLS}}
            )
        if method == "tools/call":
            text = f"{payload['params']['name']} a répondu"
            return self._send(
                {
                    "jsonrpc": "2.0",
                    "id": payload.get("id"),
                    "result": {"content": [{"type": "text", "text": text}]},
                }
            )
        return self._send({"error": {"code": -32601, "message": "no such method"}}, status=400)

    def _send(
        self, body: dict[str, Any], headers: dict[str, str] | None = None, status: int = 200
    ) -> None:
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(raw)


@pytest.fixture
def server() -> Any:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{httpd.server_address[1]}/mcp"
    forget_session(url)
    yield Server(name="faux", url=url)
    forget_session(url)
    httpd.shutdown()


async def test_it_lists_the_tools_of_a_stateful_server(server: Server) -> None:
    tools = await list_tools(server, transport=http_rpc)
    assert [tool.name for tool in tools] == ["search"]


async def test_it_calls_a_tool_of_a_stateful_server(server: Server) -> None:
    # The handshake happens inside the call, as it does in production.
    answer = await call_tool(server, "search", {"query": "portes"}, transport=http_rpc)
    assert answer["text"] == "search a répondu"
    assert answer["failed"] is False


async def test_without_the_session_the_server_refuses(server: Server) -> None:
    """The proof that the session is what makes the calls work."""
    from usine_api.mcp import Transport

    async def stateless(url: str, payload: dict[str, Any]) -> dict[str, Any]:
        """The same transport, but it forgets the session header on purpose."""
        from usine_api.mcp import forget_session as drop

        drop(url)
        answer = await http_rpc(url, payload)
        drop(url)
        return answer

    from usine_api.mcp import McpRefusal

    transport: Transport = stateless
    # A refusal, not a silent empty list: the caller must know the server said no.
    with pytest.raises(McpRefusal):
        await list_tools(server, transport=transport)
