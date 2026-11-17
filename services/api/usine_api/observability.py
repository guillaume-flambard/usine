"""Langfuse traces and versioned prompts for the supervisor graph (MEM-16).

Langfuse Python SDK 5.2 against the lab's Langfuse 4.80 (SDK v5 needs 4.59 or
later: langfuse.com/docs/observability/sdk/upgrade-path/python-v4-to-v5).

- Traces: `CallbackHandler` from `langfuse.langchain`, passed in the run config;
  LangGraph hands it to every node and model call. The trace takes the chat
  thread as `session_id`, the account id (never the email) as `user_id`.
- Prompts: `get_prompt(name, fallback=...)`. The text in Langfuse wins; the
  default in `graph/prompts.py` serves when Langfuse is absent. A prompt fetched
  from Langfuse is linked to the generation that used it (`langfuse_prompt` in a
  PromptTemplate's metadata, `langfuse/langchain/CallbackHandler.py`).

Tracing never breaks a run. Without keys, nothing is sent. With keys and
Langfuse unreachable, the SDK catches its own export errors, and the prompt
falls back to the default: the service says so once in its logs, not per run.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Mapping
from contextlib import suppress
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import ensure_config

from usine_api.graph.prompts import default_prompt

logger = logging.getLogger("usine.observability")

TRACE_NAME = "usine/chat"
_warned: set[str] = set()


def _warn_once(key: str, message: str, *args: object) -> None:
    if key in _warned:
        return
    _warned.add(key)
    logger.warning(message, *args)


def tracing_configured(env: Mapping[str, str] | None = None) -> bool:
    env = os.environ if env is None else env
    return bool(env.get("LANGFUSE_PUBLIC_KEY") and env.get("LANGFUSE_SECRET_KEY"))


def run_config(
    thread_id: str, *, user_id: str | None = None, specialist: str | None = None
) -> dict[str, Any]:
    """The LangGraph run config: the checkpoint thread, plus tracing when configured.

    `specialist` names the implementation this run is pinned to (MEM-33); the
    graph reads it from its own config, never from a global.
    """
    configurable: dict[str, Any] = {"thread_id": thread_id}
    if specialist:
        configurable["specialist"] = specialist
    config: dict[str, Any] = {"configurable": configurable}
    if not tracing_configured():
        return config
    try:
        from langfuse.langchain import CallbackHandler

        handler = CallbackHandler()
    except Exception as error:  # noqa: BLE001 - tracing never breaks a run
        _warn_once("handler", "Langfuse tracing disabled: %s", error)
        return config
    metadata: dict[str, Any] = {
        "langfuse_session_id": thread_id,
        "langfuse_trace_name": TRACE_NAME,
        "langfuse_tags": ["usine", "v2"],
    }
    if user_id:
        metadata["langfuse_user_id"] = user_id
    return {**config, "callbacks": [handler], "metadata": metadata}


class Prompts:
    """Prompt texts by name: Langfuse first, the code default otherwise."""

    def __init__(self, *, cache_ttl_seconds: int = 60) -> None:
        self.cache_ttl_seconds = cache_ttl_seconds

    def get(self, name: str) -> tuple[str, Any | None]:
        """The text, and the Langfuse prompt to link to the generation (or None)."""
        default = default_prompt(name)
        if not tracing_configured():
            return default, None
        try:
            from langfuse import get_client

            prompt = get_client().get_prompt(
                name, fallback=default, cache_ttl_seconds=self.cache_ttl_seconds
            )
        except Exception as error:  # noqa: BLE001 - a prompt store never breaks a run
            _warn_once(
                f"prompt:{name}", "Langfuse prompt %s unavailable, default used: %s", name, error
            )
            return default, None
        if prompt.is_fallback:
            _warn_once(f"prompt:{name}", "Langfuse prompt %s not found, default used", name)
            return default, None
        return str(prompt.compile()), prompt


def chat_template(text: str, linked: Any | None) -> ChatPromptTemplate:
    """System text then the human input, linked to its Langfuse version if any.

    The text is literal: braces are escaped so a prompt edited in Langfuse can
    never be read as a template variable.
    """
    literal = text.replace("{", "{{").replace("}", "}}")
    template = ChatPromptTemplate.from_messages([("system", literal), ("human", "{input}")])
    if linked is not None:
        template.metadata = {"langfuse_prompt": linked}
    return template


def record_gate_decision(config: dict[str, Any], thread_id: str, decision: dict[str, Any]) -> None:
    """The human decision as a named score in Langfuse (MEM-21).

    On the trace of the run that resumed after the gate (the handler's last
    trace), else on the session. Never breaks a run.
    """
    if not tracing_configured() or not config.get("callbacks"):
        return
    try:
        from langfuse import get_client

        trace_id = getattr(config["callbacks"][0], "last_trace_id", None)
        target: dict[str, Any] = {"trace_id": trace_id} if trace_id else {"session_id": thread_id}
        get_client().create_score(
            name="porte-humaine",
            value=str(decision.get("decision", "")),
            data_type="CATEGORICAL",
            comment=decision.get("reason") or None,
            **target,
        )
    except Exception as error:  # noqa: BLE001 - tracing never breaks a run
        _warn_once("gate-score", "Langfuse score for the human gate not sent: %s", error)


#: The daily triage's decisions, one item per proposal (ADR 0003, point 9).
TRIAGE_DATASET = "usine-tri"


def record_triage_decisions(
    thread_id: str, actions: list[dict[str, Any]], decision: dict[str, Any]
) -> None:
    """Every proposal of a triage gate, and whether the person kept it.

    The agents' precision (the share of their proposals accepted) is read from
    this dataset over the days. `create_dataset_item` upserts by `id`
    (langfuse 5.2.0, `_client/client.py`), so a replayed decision overwrites.
    Never breaks a run.
    """
    if not tracing_configured():
        return
    approved = decision.get("decision") in ("approve", "edit")
    selected = decision.get("selected")
    try:
        from langfuse import get_client

        client = get_client()
        with suppress(Exception):
            # Already there after the first day: the error is the normal case.
            client.create_dataset(name=TRIAGE_DATASET, description="Tri quotidien : décisions")
        for index, action in enumerate(actions):
            kept = approved and (selected is None or index in selected)
            client.create_dataset_item(
                dataset_name=TRIAGE_DATASET,
                id=f"{thread_id}:{index}",
                input=action,
                expected_output={"approved": kept},
                metadata={"thread_id": thread_id, "reason": decision.get("reason")},
            )
    except Exception as error:  # noqa: BLE001 - tracing never breaks a run
        _warn_once("triage-dataset", "Langfuse dataset for the triage gate not sent: %s", error)


def _trace_target() -> dict[str, Any]:
    """Where to attach a score: the run's trace, else its session, else nowhere."""
    config = ensure_config()
    callbacks = config.get("callbacks")
    handler = callbacks[0] if isinstance(callbacks, list) and callbacks else callbacks
    trace_id = getattr(handler, "last_trace_id", None)
    if trace_id:
        return {"trace_id": trace_id}
    session = (config.get("metadata") or {}).get("langfuse_session_id")
    return {"session_id": session} if session else {}


def record_verdict_attempts(attempts: int, specialist: str, *, refused: bool) -> None:
    """How many tries a typed verdict needed, as a score on the run's trace.

    Best effort like every trace here: a missing Langfuse never breaks a run.
    """
    if not tracing_configured():
        return
    try:
        target = _trace_target()
        if not target:
            return
        from langfuse import get_client

        get_client().create_score(
            name="verdict/tentatives",
            value=float(attempts),
            data_type="NUMERIC",
            comment=(
                f"{specialist} : {'refusé' if refused else 'validé'} après {attempts} tentative(s)"
            ),
            **target,
        )
    except Exception as error:  # noqa: BLE001 - tracing never breaks a run
        _warn_once("verdict-score", "Langfuse score for the verdict not sent: %s", error)
