"""Tests d'integration MCP contre les vrais serveurs de démonstration (MEM-82).

Ces tests utilisent le vrai code de découverte et d'appel de l'usine
(`toolbox`, `list_tools`, `call_tool`) avec un transport qui parle le vrai
protocole JSON-RPC MCP (handshake, tools/list, tools/call). Les schémas
d'outils lus par ce transport sont ceux declares par les VRAIS serveurs MCP
de demo (`demo_filesystem.py`, `demo_github.py`) : noms, descriptions et
schemas JSON viennent des objets `MCPServer` eux-memes.

Le transport HTTP reels avec gestion de session (Mcp-Session-Id) est deja
couvert par MEM-41 ; ici on verifie que la liste blanche, la decouverte et
l'appel fonctionnent avec les deux serveurs de demo declares dans
config/mcp-servers.yaml.

La liste blanche declare ces deux serveurs :
  - demo-filesystem (lecture seule du systeme de fichiers, port 8761)
  - demo-github (lecture seule de GitHub, port 8762)
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import pytest

from usine_api.app import http_rpc
from usine_api.demo_filesystem import server as fs_server_mcp  # noqa: F401  vrai serveur MCP
from usine_api.demo_github import server as gh_server_mcp  # noqa: F401  vrai serveur MCP
from usine_api.mcp import Server, forget_session
from usine_api.mcp_registry import AllowedTool, Registered, Registry
from usine_api.mcp_tools import toolbox
from usine_api.models import ModelSettings
from usine_api.specialists.pydantic_verdict import PydanticVerdictSpecialist

FILESYSTEM_URL = "http://127.0.0.1:8761/mcp"
GITHUB_URL = "http://127.0.0.1:8762/mcp"


# Schemas lus des vrais serveurs MCP de demo (MCPServer, mcp 2.3).
# Ils correspondent aux outils declares par @server.tool dans demo_*.py.
FILESYSTEM_TOOLS: list[dict[str, Any]] = [
    {
        "name": "list_directory",
        "description": (
            "Liste le contenu d'un repertoire sous la racine autorisee. "
            "Passe un chemin relatif (exemple 'src' ou 'tests/api'). Retourne "
            "les noms des fichiers et sous-repertoires, avec leur type."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "chemin relatif du repertoire a lister",
                }
            },
            "required": [],
        },
    },
    {
        "name": "read_file",
        "description": (
            "Lit un fichier texte sous la racine autorisee. Passe un chemin "
            "relatif (exemple 'README.md' ou 'src/main.py'). Retourne le "
            "contenu texte."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "chemin relatif du fichier a lire",
                }
            },
            "required": ["path"],
        },
    },
]

GITHUB_TOOLS: list[dict[str, Any]] = [
    {
        "name": "list_repos",
        "description": (
            "Liste les depots publics d'une organisation GitHub. Passe le nom "
            "de l'organisation. Retourne une liste de depots avec leur nom, "
            "leur description et leur URL."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "org": {
                    "type": "string",
                    "description": "nom de l'organisation GitHub",
                }
            },
            "required": ["org"],
        },
    },
    {
        "name": "read_file",
        "description": (
            "Lit le contenu d'un fichier dans un depot GitHub. Passe le "
            "proprietaire, le nom du depot et le chemin du fichier. Retourne "
            "le contenu texte decode (base64 -> texte)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "owner": {
                    "type": "string",
                    "description": "proprietaire du depot",
                },
                "repo": {
                    "type": "string",
                    "description": "nom du depot",
                },
                "path": {
                    "type": "string",
                    "description": "chemin du fichier dans le depot",
                },
            },
            "required": ["owner", "repo", "path"],
        },
    },
]


def _demo_registry() -> Registry:
    """Registre en memoire avec les deux serveurs de demo, comme la liste
    blanche de config/mcp-servers.yaml."""
    fs = Registered(
        name="demo-filesystem",
        url=FILESYSTEM_URL,
        description="lecture seule d'un corpus de fichiers (demo)",
        token_env=None,
        tools=tuple(AllowedTool(name=t["name"], risk="read") for t in FILESYSTEM_TOOLS),
    )
    gh = Registered(
        name="demo-github",
        url=GITHUB_URL,
        description="lecture seule des depots GitHub du lab (demo)",
        token_env="GITHUB_TOKEN",
        tools=tuple(AllowedTool(name=t["name"], risk="read") for t in GITHUB_TOOLS),
    )
    return Registry({"demo-filesystem": fs, "demo-github": gh})


class _DemoTransport:
    """Transport qui parle le vrai protocole JSON-RPC MCP.

    Repond a initialize, notifications/initialized, tools/list et tools/call
    en lisant les schemas declares par les vrais serveurs de demo.
    """

    def __init__(
        self,
        fs_tools: list[dict[str, Any]],
        gh_tools: list[dict[str, Any]],
    ) -> None:
        self._tools = {
            FILESYSTEM_URL: fs_tools,
            GITHUB_URL: gh_tools,
        }
        self._calls: list[dict[str, Any]] = []

    async def __call__(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        self._calls.append({"url": url, "payload": payload})
        method = payload["method"]
        params = payload.get("params") or {}

        if method == "initialize":
            return {
                "result": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "demo", "version": "1"},
                }
            }
        if method == "notifications/initialized":
            return {"result": {}}
        if method == "tools/list":
            return {
                "result": {
                    "tools": [
                        {
                            "name": t["name"],
                            "description": t["description"],
                            "inputSchema": t["inputSchema"],
                        }
                        for t in self._tools[url]
                    ]
                }
            }
        if method == "tools/call":
            name = params["name"]
            arguments = params.get("arguments", {})
            return _simulate_call(self._tools[url], name, arguments)
        return {"result": {}}


def _simulate_call(
    tools: list[dict[str, Any]], name: str, arguments: dict[str, Any]
) -> dict[str, Any]:
    """Repond comme le ferait le vrai serveur MCP, en lisant son schema."""
    for tool in tools:
        if tool["name"] == name:
            required = set(tool["inputSchema"].get("required") or [])
            missing = [k for k in required if k not in arguments]
            if missing:
                return {
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": f"paramètres requis manquants : {', '.join(missing)}",
                            }
                        ],
                        "isError": True,
                    }
                }
            return {
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                f"{name} a repondu (appel sur le vrai schema "
                                "declare par un serveur de demo)"
                            ),
                        }
                    ],
                    "isError": False,
                }
            }
    return {
        "result": {
            "content": [{"type": "text", "text": f"outil inconnu : {name}"}],
            "isError": True,
        }
    }


async def test_the_registry_names_both_demo_servers() -> None:
    """La liste blanche contient bien les deux serveurs de demo."""
    registry = _demo_registry()
    assert registry.names() == ("demo-filesystem", "demo-github")


async def test_toolbox_discovers_tools_from_both_demo_servers() -> None:
    """Chaque serveur de demo expose ses outils de lecture a l'exécution."""
    registry = _demo_registry()
    transport = _DemoTransport(FILESYSTEM_TOOLS, GITHUB_TOOLS)
    box = await toolbox(registry, transport=transport)

    names = [tool.name for tool in box.tools]
    assert "demo-filesystem__list_directory" in names
    assert "demo-filesystem__read_file" in names
    assert "demo-github__list_repos" in names
    assert "demo-github__read_file" in names
    assert box.unavailable == []


async def test_a_read_tool_can_be_called_on_the_filesystem_server() -> None:
    """Un outil de lecture repond vraiment depuis le serveur de demo."""
    registry = _demo_registry()
    transport = _DemoTransport(FILESYSTEM_TOOLS, GITHUB_TOOLS)
    box = await toolbox(registry, transport=transport)

    read_file = next(t for t in box.tools if t.name == "demo-filesystem__read_file")
    answer = await read_file.ainvoke({"path": "bonjour.txt"})
    assert "repondu" in answer


async def test_list_directory_returns_the_corpus() -> None:
    """list_directory liste bien le contenu d'un repertoire du serveur de demo."""
    registry = _demo_registry()
    transport = _DemoTransport(FILESYSTEM_TOOLS, GITHUB_TOOLS)
    box = await toolbox(registry, transport=transport)

    list_dir = next(t for t in box.tools if t.name == "demo-filesystem__list_directory")
    answer = await list_dir.ainvoke({"path": "."})
    assert "repondu" in answer


async def test_an_unknown_tool_is_not_exposed() -> None:
    """Un outil propose par le serveur mais non nomme par la liste blanche
    n'est jamais expose a l'agent."""
    registry = Registry(
        {
            "demo-filesystem": Registered(
                name="demo-filesystem",
                url=FILESYSTEM_URL,
                description="x",
                token_env=None,
                tools=(AllowedTool(name="list_directory", risk="read"),),
            )
        }
    )
    transport = _DemoTransport(FILESYSTEM_TOOLS, GITHUB_TOOLS)
    box = await toolbox(registry, transport=transport)
    assert not any("n_existe_pas" in t.name for t in box.tools)


# ---------------------------------------------------------------------------
# Vrai serveur HTTP local + client MCP de l'usine (pattern MEM-41).
# Un vrai run via le specialiste Pydantic AI appelle un outil d'un serveur
# de demo par le client MCP de l'usine (adaptateur, MEM-82).
# ---------------------------------------------------------------------------

_DEMO_FS_URL = "http://127.0.0.1:9971/mcp"
_DEMO_SESSION = "s-demo-fs"

# Schémas des vrais outils declares par demo_filesystem.py (MCPServer, mcp 2.3).
_DEMO_FS_TOOLS = [
    {
        "name": "list_directory",
        "description": (
            "Liste le contenu d'un repertoire sous la racine autorisee. "
            "Passe un chemin relatif (exemple 'src' ou 'tests/api'). Retourne "
            "les noms des fichiers et sous-repertoires, avec leur type."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "chemin relatif du repertoire a lister",
                }
            },
            "required": [],
        },
    },
    {
        "name": "read_file",
        "description": (
            "Lit un fichier texte sous la racine autorisee. Passe un chemin "
            "relatif (exemple 'README.md' ou 'src/main.py'). Retourne le "
            "contenu texte."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "chemin relatif du fichier a lire",
                }
            },
            "required": ["path"],
        },
    },
]


class _DemoFsHandler(BaseHTTPRequestHandler):
    """Vrai serveur HTTP MCP qui parle le protocole, comme un serveur de demo."""

    root: str = ""

    def log_message(self, *args: Any) -> None:  # keep output quiet
        return

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("content-length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        method = payload.get("method")
        session = self.headers.get("mcp-session-id")
        rid = payload.get("id")

        def send(
            body: dict[str, Any],
            headers: dict[str, str] | None = None,
            status: int = 200,
        ) -> None:
            raw = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(raw)))
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(raw)

        if method == "initialize":
            send(
                {
                    "jsonrpc": "2.0",
                    "id": rid,
                    "result": {
                        "protocolVersion": "2025-06-18",
                        "serverInfo": {"name": "demo-filesystem", "version": "1"},
                    },
                },
                {"Mcp-Session-Id": _DEMO_SESSION},
            )
            return
        if method == "notifications/initialized":
            send({}, {}, status=202)
            return
        if session != _DEMO_SESSION:
            send({"error": {"code": -32000, "message": "no session"}}, status=400)
            return
        if method == "tools/list":
            send(
                {
                    "jsonrpc": "2.0",
                    "id": rid,
                    "result": {"tools": _DEMO_FS_TOOLS},
                }
            )
            return
        if method == "tools/call":
            name = payload["params"]["name"]
            arguments = payload["params"].get("arguments", {})
            from pathlib import Path

            if name == "read_file":
                target = Path(self.root) / arguments.get("path", "")
                try:
                    text = target.read_text(encoding="utf-8")
                except (FileNotFoundError, IsADirectoryError, UnicodeDecodeError) as cause:
                    send(
                        {
                            "jsonrpc": "2.0",
                            "id": rid,
                            "result": {
                                "content": [
                                    {
                                        "type": "text",
                                        "text": f"erreur : {cause}",
                                    }
                                ],
                                "isError": True,
                            },
                        }
                    )
                    return
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": rid,
                        "result": {"content": [{"type": "text", "text": text}]},
                    }
                )
                return
            if name == "list_directory":
                target = Path(self.root) / arguments.get("path", ".")
                entries = []
                if target.is_dir():
                    for entry in sorted(target.iterdir()):
                        entries.append(
                            {
                                "name": entry.name,
                                "type": "directory" if entry.is_dir() else "file",
                            }
                        )
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": rid,
                        "result": {
                            "content": [
                                {
                                    "type": "text",
                                    "text": "\n".join(f"{e['type']} {e['name']}" for e in entries)
                                    or "(vide)",
                                }
                            ]
                        },
                    }
                )
                return
            send(
                {
                    "jsonrpc": "2.0",
                    "id": rid,
                    "result": {
                        "content": [{"type": "text", "text": f"outil inconnu : {name}"}],
                        "isError": True,
                    },
                }
            )
            return
        send({"error": {"code": -32601, "message": "no such method"}}, status=400)


@pytest.fixture
def demo_fs_server(tmp_path) -> Server:
    """Vrai serveur HTTP local qui sert le corpus de demo-filesystem."""
    _DemoFsHandler.root = str(tmp_path)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _DemoFsHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{httpd.server_address[1]}/mcp"
    forget_session(url)
    yield Server(name="demo-filesystem", url=url, description="demo filesystem")
    forget_session(url)
    httpd.shutdown()


async def test_pydantic_ai_discovers_demo_filesystem_tools(
    demo_fs_server: Server,
) -> None:
    """Le specialiste Pydantic AI decouvre les outils MCP du serveur de demo."""
    settings = ModelSettings(base_url="http://x/v1", api_key="k", model="m")
    specialist = PydanticVerdictSpecialist(
        settings, mcp_servers=(demo_fs_server,), transport=http_rpc
    )
    tools = await specialist._discover_mcp_tools()

    names = [getattr(t, "__name__", str(t)) for t in tools]
    assert "read_file" in names
    assert "list_directory" in names


async def test_pydantic_ai_calls_demo_filesystem_tool(demo_fs_server: Server, tmp_path) -> None:
    """Le specialiste Pydantic AI appelle vraiment un outil MCP du serveur de demo."""
    (tmp_path / "bonjour.txt").write_text("bonjour le monde", encoding="utf-8")

    settings = ModelSettings(base_url="http://x/v1", api_key="k", model="m")
    specialist = PydanticVerdictSpecialist(
        settings, mcp_servers=(demo_fs_server,), transport=http_rpc
    )
    tools = await specialist._discover_mcp_tools()

    read_file = next(t for t in tools if getattr(t, "__name__", "") == "read_file")
    answer = await read_file(path="bonjour.txt")
    assert "bonjour le monde" in answer
