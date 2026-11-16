"""The service finds config/ and its cassettes outside the repository.

In the image the package is installed in the venv (--no-editable), so a path
computed from __file__ points into /opt/venv/lib. Production then looked for
the MCP whitelist in /opt/venv/lib/config, found nothing, and the GitHub tool
agent was never wired: runs answered without tools (16 November 2026).
"""

from pathlib import Path

from usine_api import app

REPO = Path(__file__).resolve().parents[3]


def test_repo_root_defaults_to_the_checkout(monkeypatch):
    monkeypatch.delenv("USINE_ROOT", raising=False)
    assert app._mcp_config_path() == REPO / "config" / "mcp-servers.yaml"
    assert app._mcp_config_path().is_file()
    assert app._cassette_path().is_file()


def test_usine_root_moves_config_and_cassettes(monkeypatch, tmp_path):
    monkeypatch.setenv("USINE_ROOT", str(tmp_path))
    monkeypatch.delenv("USINE_CASSETTE", raising=False)
    assert app._mcp_config_path() == tmp_path / "config" / "mcp-servers.yaml"
    assert app._cassette_path() == tmp_path / "services" / "api" / "cassettes" / "demo.json"


def test_the_image_sets_usine_root_to_its_copy_of_the_repo():
    dockerfile = (REPO / "Dockerfile").read_text()
    assert "USINE_ROOT=/src" in dockerfile
    assert "COPY config /src/config" in dockerfile
    assert "COPY --from=api /src/services/api /src/services/api" in dockerfile
    # The builder's umask 077 made config/ root 0600, unreadable by `usine`.
    runtime = dockerfile.split("# --- runtime")[1]
    assert runtime.index("RUN chmod -R a+rX") < runtime.index("USER usine")
