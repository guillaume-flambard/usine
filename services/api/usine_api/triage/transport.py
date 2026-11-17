"""Un transport MCP qui porte son propre jeton (ADR 0003, correction du 17 novembre 2026).

Un PAT à grain fin ne couvre qu'un propriétaire : le tri a un jeton par compte.
Le transport du service (`app.http_rpc`) retrouve le jeton d'un serveur par son
URL, et le serveur MCP de GitHub n'a qu'une URL : deux jetons s'y écraseraient.
Celui-ci garde son jeton et ses sessions pour lui, comme le protocole le veut
(Streamable HTTP, en-tête `mcp-session-id`) : une session ouverte avec un jeton
n'est jamais rejouée avec l'autre.

Le jeton du chat (`USINE_GITHUB_TOKEN`, limité au dépôt `usine`) n'est pas touché.
"""

from __future__ import annotations

from typing import Any

import httpx

from usine_api.mcp import SESSION_HEADER, TIMEOUT_SECONDS, parse_body


class TokenTransport:
    """A JSON-RPC transport bound to one bearer token."""

    def __init__(self, token: str, *, http: httpx.AsyncBaseTransport | None = None) -> None:
        self._token = token
        self._http = http
        self._sessions: dict[str, str] = {}

    async def __call__(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {
            "accept": "application/json, text/event-stream",
            "authorization": f"Bearer {self._token}",
        }
        session = self._sessions.get(url)
        if session:
            headers[SESSION_HEADER] = session
        async with httpx.AsyncClient(timeout=float(TIMEOUT_SECONDS), transport=self._http) as c:
            response = await c.post(url, json=payload, headers=headers)
        announced = response.headers.get(SESSION_HEADER)
        if announced:
            self._sessions[url] = announced
        return parse_body(response.headers.get("content-type", ""), response.text)
