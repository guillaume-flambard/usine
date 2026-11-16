"""The page served by the production image (MEM-58).

One image answers the API and serves the built page. What this protects:

- the page and its built files are public, with their security headers;
- a path that is not a built file falls through to the API and its lock, so a
  closed atelier route never turns into a page;
- a path never escapes the built folder.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from test_atelier_lock import closed_app

from usine_api.spa import PAGE_POLICY, page_file


@pytest.fixture
def built(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    web = tmp_path / "dist"
    (web / "assets").mkdir(parents=True)
    (web / "index.html").write_text("<!doctype html><title>L'usine agentique</title>")
    (web / "assets" / "index-abc123.js").write_text("console.log(1)")
    (tmp_path / "secret.txt").write_text("hors du dossier construit")
    monkeypatch.setenv("USINE_WEB_DIR", str(web))
    yield web


def test_the_page_is_public_and_hardened(built: Path) -> None:
    with TestClient(closed_app()) as client:
        page = client.get("/")
        asset = client.get("/assets/index-abc123.js")

    assert page.status_code == 200
    assert "L'usine agentique" in page.text
    assert page.headers["content-security-policy"] == PAGE_POLICY
    assert page.headers["cache-control"] == "no-cache"
    assert page.headers["x-frame-options"] == "DENY"
    assert asset.status_code == 200
    assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_the_api_stays_behind_the_lock(built: Path) -> None:
    with TestClient(closed_app()) as client:
        assert client.get("/api/runs").status_code == 401
        assert client.get("/runs").status_code == 401
        assert client.get("/health").status_code == 200


def test_an_unknown_path_is_not_the_page(built: Path) -> None:
    with TestClient(closed_app()) as client:
        reply = client.get("/nulle-part")
    assert "L'usine agentique" not in reply.text


def test_a_path_never_leaves_the_built_folder(built: Path) -> None:
    assert page_file(built, "/../secret.txt") is None
    assert page_file(built, "/assets/../../secret.txt") is None
    assert page_file(built, "/assets/index-abc123.js") is not None


def test_without_a_built_folder_nothing_is_served(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("USINE_WEB_DIR", raising=False)
    with TestClient(closed_app()) as client:
        assert client.get("/").status_code in (401, 404)


def test_a_nul_byte_is_not_a_crash(built: Path) -> None:
    assert page_file(built, "/assets/index-abc123.js\x00") is None
    with TestClient(closed_app()) as client:
        assert client.get("/assets/index-abc123.js%00").status_code in (401, 404)


def test_the_public_visit_is_the_page_for_anyone(built: Path) -> None:
    # Production, 16 November 2026: /visite fell through to the lock and every
    # visitor got a 401 instead of the recorded run.
    with TestClient(closed_app()) as client:
        visit = client.get("/visite")
        slash = client.get("/visite/")
        assert client.get("/api/runs").status_code == 401
    assert visit.status_code == 200
    assert "L'usine agentique" in visit.text
    assert visit.headers["content-security-policy"] == PAGE_POLICY
    assert slash.status_code == 200
