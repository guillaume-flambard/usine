"""La liste blanche des serveurs d'outils (MEM-37), sans réseau.

Ce que ces tests protègent : un nom résout, une adresse ne résout pas, un outil
hors liste n'existe pas pour l'agent, et un outil irréversible ne s'exécute
jamais à la demande d'un agent.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.mcp_registry import Registry, RegistryRefusal

CONFIG = """
servers:
  - name: docs
    url: https://mcp.exemple.test/docs
    description: la documentation du lab
    tools:
      search: read
      fetch: read
  - name: annonces
    url: https://mcp.exemple.test/annonces
    token_env: MCP_ANNONCES_TOKEN
    tools:
      list: read
      publish: irreversible
"""


def registry(tmp_path: Path, text: str = CONFIG) -> Registry:
    path = tmp_path / "mcp-servers.yaml"
    path.write_text(text, encoding="utf-8")
    return Registry.load(path)


def test_a_named_server_resolves_to_its_address(tmp_path: Path) -> None:
    found = registry(tmp_path).resolve("docs")
    assert found.url == "https://mcp.exemple.test/docs"
    assert found.server().name == "docs"


def test_an_address_is_not_a_name(tmp_path: Path) -> None:
    with pytest.raises(RegistryRefusal) as refused:
        registry(tmp_path).resolve("https://evil.example/mcp")
    assert refused.value.status == 400
    assert "adresse" in refused.value.message


def test_an_unknown_name_is_refused_with_the_known_ones(tmp_path: Path) -> None:
    with pytest.raises(RegistryRefusal) as refused:
        registry(tmp_path).resolve("inconnu")
    # Sorted, so the message does not depend on the file's order.
    assert "annonces, docs" in refused.value.message


def test_an_unknown_tool_is_refused(tmp_path: Path) -> None:
    with pytest.raises(RegistryRefusal) as refused:
        registry(tmp_path).allowed("docs", "delete_everything")
    assert refused.value.status == 403


def test_an_irreversible_tool_is_refused_before_anything_runs(tmp_path: Path) -> None:
    with pytest.raises(RegistryRefusal) as refused:
        registry(tmp_path).check_call("annonces", "publish")
    assert refused.value.status == 409
    assert "porte" in refused.value.message
    # A reversible call passes; the risk is what decides.
    assert registry(tmp_path).check_call("docs", "search") == "read"
    assert registry(tmp_path).check_call("annonces", "list") == "read"


def test_a_bad_config_is_a_startup_error(tmp_path: Path) -> None:
    for broken in (
        "servers:\n  - name: 'Docs'\n    url: https://x.test\n    tools: {a: read}\n",
        "servers:\n  - name: docs\n    url: ftp://x.test\n    tools: {a: read}\n",
        "servers:\n  - name: docs\n    url: https://x.test\n    tools: {a: peut-être}\n",
        "servers:\n  - name: docs\n    url: https://x.test\n    tools: {}\n",
    ):
        with pytest.raises(ValueError):
            registry(tmp_path, broken)


def test_an_empty_file_means_no_server(tmp_path: Path) -> None:
    empty = registry(tmp_path, "servers: []\n")
    assert empty.names() == ()
    with pytest.raises(RegistryRefusal):
        empty.resolve("docs")


def test_the_route_refuses_an_irreversible_tool(tmp_path: Path) -> None:
    """The service never runs an irreversible tool on a plain request."""
    app = create_app(
        key="",
        registry=registry(tmp_path),
        servers={"annonces": _server("annonces")},
    )
    with TestClient(app) as client:
        reply = client.post("/tools/annonces/publish", json={"arguments": {"texte": "bonjour"}})
    assert reply.status_code == 409
    assert "porte" in reply.json()["error"]


def test_the_route_refuses_a_tool_outside_the_list(tmp_path: Path) -> None:
    app = create_app(
        key="",
        registry=registry(tmp_path),
        servers={"docs": _server("docs")},
    )
    with TestClient(app) as client:
        reply = client.post("/tools/docs/delete", json={"arguments": {}})
    assert reply.status_code == 403


def _server(name: str) -> Any:
    from usine_api.mcp import Server

    return Server(name=name, url="https://mcp.exemple.test/mcp")
