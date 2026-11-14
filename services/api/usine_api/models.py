"""The chat model client: every model call goes through the lab's LiteLLM (MEM-13).

One place for keys, quotas and costs: the service only knows LiteLLM's URL and
its own LiteLLM key, never a provider key. The model is a setting
(`USINE_MODEL`, a LiteLLM `model_name`), `lab-fast` by default.

The fallback model is not configured here: LiteLLM already replays a failed
`model_name` down its `fallbacks` chain (lab-infra `stacks/litellm/config.yaml`,
`lab-fast` falls back to Mistral, Z.ai, then OVH). A second chain in the service
would be a second authority on routing.

Reasoning is off by default (`enable_thinking: false` in the request body,
`USINE_MODEL_EXTRAS` to change it). Measured in lab-infra on 2026-09-09: with
reasoning on, the model spent its whole output budget thinking and the gateway
timed out; with it off, 35 times faster and no 504. Every link of the
`lab-fast` chain drops the parameter when its provider does not know it
(`additional_drop_params`). Another model may need `USINE_MODEL_EXTRAS={}`.

Retry policy, already paid for in lab-infra (`stacks/_partage/modele.py`):

- a 4xx is never retried: the request is wrong or the key is refused, and
  retrying only burns the quota. Read in the installed openai SDK
  (`_base_client._should_retry`): it retries 408 and 409 on its own, so its
  retries are switched off (`max_retries=0`) and replaced by ours;
- 429, 5xx, timeouts and connection errors are transient: retried with an
  exponential, jittered, bounded wait (LangChain `Runnable.with_retry`).
"""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

import httpx
from langchain_core.runnables.config import ensure_config
from langchain_core.runnables.retry import ExponentialJitterParams
from langchain_openai import ChatOpenAI
from openai import APIConnectionError, InternalServerError, RateLimitError

DEFAULT_MODEL = "lab-fast"
DEFAULT_EXTRAS: dict[str, Any] = {"enable_thinking": False}

#: Transient failures, and only those. APITimeoutError is an APIConnectionError.
RETRYABLE: tuple[type[BaseException], ...] = (
    RateLimitError,
    InternalServerError,
    APIConnectionError,
)


@dataclass(frozen=True)
class ModelSettings:
    base_url: str
    api_key: str
    model: str
    timeout_s: float = 60.0
    max_attempts: int = 3
    backoff: ExponentialJitterParams | None = None
    extras: Mapping[str, Any] = field(default_factory=lambda: dict(DEFAULT_EXTRAS))


def model_settings(env: Mapping[str, str] | None = None) -> ModelSettings | None:
    """The settings, or None when no LiteLLM is configured (replayed demo)."""
    env = os.environ if env is None else env
    base_url = env.get("LITELLM_BASE_URL", "").rstrip("/")
    if not base_url:
        return None
    return ModelSettings(
        base_url=base_url,
        api_key=env.get("LITELLM_API_KEY", ""),
        model=env.get("USINE_MODEL") or DEFAULT_MODEL,
        extras=_extras(env.get("USINE_MODEL_EXTRAS")),
    )


def _extras(raw: str | None) -> dict[str, Any]:
    """Non-standard body parameters. A broken value is a startup error: it
    would otherwise silently turn reasoning back on."""
    if raw is None:
        return dict(DEFAULT_EXTRAS)
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("USINE_MODEL_EXTRAS must be a JSON object")
    return value


def current_session_id() -> str | None:
    """The thread of the graph run this call belongs to, if any.

    LangGraph hands its config to every runnable a node calls, through a context
    variable; the chat thread is its `thread_id`.
    """
    thread = ensure_config().get("configurable", {}).get("thread_id")
    return thread if isinstance(thread, str) else None


def chat_model(
    settings: ModelSettings,
    *,
    http_client: httpx.AsyncClient | None = None,
    session_id: str | None = None,
) -> ChatOpenAI:
    """The bare chat model: no retries of its own (see the module docstring).

    The product calls models asynchronously (`ainvoke`), so the client a test
    injects is the async one.

    `session_id` goes to LiteLLM as `litellm_session_id`, which its Langfuse
    exporter turns into the trace session (litellm/integrations/otel/model/
    metadata.py, `caller_session_id`). The run traced by the usine and the
    model calls traced by LiteLLM, cost included, then share one session.
    """
    kwargs: dict[str, Any] = {}
    if http_client is not None:
        kwargs["http_async_client"] = http_client
    extra_body = dict(settings.extras)
    if session_id:
        extra_body["litellm_session_id"] = session_id
    return ChatOpenAI(
        model=settings.model,
        base_url=settings.base_url,
        api_key=settings.api_key,
        timeout=settings.timeout_s,
        max_retries=0,
        extra_body=extra_body or None,
        **kwargs,
    )


def retry_kwargs(settings: ModelSettings) -> dict[str, Any]:
    """Arguments for `Runnable.with_retry`, so every model runnable retries alike."""
    return {
        "retry_if_exception_type": RETRYABLE,
        "wait_exponential_jitter": True,
        "exponential_jitter_params": settings.backoff
        or ExponentialJitterParams(max=8, exp_base=2, jitter=1),
        "stop_after_attempt": settings.max_attempts,
    }
