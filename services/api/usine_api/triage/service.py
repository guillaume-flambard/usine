"""Wiring the daily triage into the service (ADR 0003).

The triage graph needs four things the service already has (the model gateway,
the MCP whitelist, its transport, the checkpointer) and one it may not: a
GitHub token that reads every repository of the two accounts. Without the
token, or without a model, there is no triage, and the route says so (503)
instead of running half a triage.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

import httpx

from usine_api.mcp import Transport
from usine_api.mcp_registry import Registry
from usine_api.mcp_tools import McpExecutor
from usine_api.models import ModelSettings

from .execute import TriageExecutor
from .github import GraphQLReader, load_policy
from .judge import LangChainJudge

TOKEN_ENV = "USINE_GITHUB_TOKEN"

#: A triage run is `tri-YYYY-MM-DD`: one a day, and its graph is found by name.
TRIAGE_PREFIX = "tri-"

TriageFactory = Callable[[Any], Any]


def is_triage(thread_id: str) -> bool:
    return thread_id.startswith(TRIAGE_PREFIX)


def default_triage(
    *,
    gateway: ModelSettings | None,
    registry: Registry,
    transport: Transport,
    policy_path: Path,
    env: Mapping[str, str],
    http_client: httpx.AsyncClient | None = None,
) -> TriageFactory | None:
    """A factory taking the checkpointer, or None when the triage cannot run."""
    token = env.get(TOKEN_ENV, "")
    if gateway is None or not token or "github" not in registry.names():
        return None
    policy = load_policy(policy_path)

    def build(checkpointer: Any) -> Any:
        from usine_api.graph.triage import build_triage_graph

        reader = GraphQLReader(token)
        judge = LangChainJudge(
            gateway, registry=registry, transport=transport, http_client=http_client
        )
        executor = TriageExecutor(McpExecutor(registry, transport=transport), reader, policy)
        return build_triage_graph(reader, judge, executor, policy, checkpointer=checkpointer)

    return build
