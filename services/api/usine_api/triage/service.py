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
from .transport import TokenTransport

#: A triage run is `tri-YYYY-MM-DD`: one a day, and its graph is found by name.
TRIAGE_PREFIX = "tri-"

#: The one organization whose triage token may start the triage and see its gate.
ORG_ENV = "USINE_TRIAGE_ORG"

#: Tools only the triage uses. The chat's agent never sees them: it has no
#: exclusion list and no mention filter (review, 17 November 2026).
TRIAGE_ONLY = frozenset({"add_issue_comment", "update_pull_request"})

TriageFactory = Callable[[Any], Any]


def is_triage(thread_id: str) -> bool:
    return thread_id.startswith(TRIAGE_PREFIX)


def default_triage(
    *,
    gateway: ModelSettings | None,
    registry: Registry,
    policy_path: Path,
    env: Mapping[str, str],
    http_client: httpx.AsyncClient | None = None,
) -> TriageFactory | None:
    """A factory taking the checkpointer, or None when the triage cannot run.

    Each account reads and writes with its own token (`tokens` in the policy
    names the variables). An account without its token is not read, and the
    run says so; with no token at all, there is no triage.
    """
    if gateway is None or "github" not in registry.names():
        return None
    policy = load_policy(policy_path)
    tokens = {
        account: env.get(variable, "")
        for account, variable in policy.tokens.items()
        if env.get(variable, "")
    }
    if not tokens:
        return None
    transports: dict[str, Transport] = {
        account: TokenTransport(token) for account, token in tokens.items()
    }
    runners = {
        account: McpExecutor(registry, transport=route) for account, route in transports.items()
    }

    def build(checkpointer: Any) -> Any:
        from usine_api.graph.triage import build_triage_graph

        reader = GraphQLReader(tokens)
        judge = LangChainJudge(
            gateway, registry=registry, transports=transports.get, http_client=http_client
        )
        executor = TriageExecutor(runners.get, reader, policy)
        return build_triage_graph(reader, judge, executor, policy, checkpointer=checkpointer)

    return build
