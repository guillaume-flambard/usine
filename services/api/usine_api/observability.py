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
from typing import Any

from langchain_core.prompts import ChatPromptTemplate

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


def run_config(thread_id: str, *, user_id: str | None = None) -> dict[str, Any]:
    """The LangGraph run config: the checkpoint thread, plus tracing when configured."""
    config: dict[str, Any] = {"configurable": {"thread_id": thread_id}}
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
