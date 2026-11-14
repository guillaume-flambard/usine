"""The first real specialist: one chat model call through LiteLLM (MEM-14).

It answers a sub-task with the `usine/specialist-task` prompt and nothing else:
no tools yet. The framework-specific specialists (CrewAI, OpenAI Agents SDK,
Pydantic AI, Claude Agent SDK) arrive with MEM-27 behind the same contract.
"""

from __future__ import annotations

from importlib.metadata import version
from typing import Any

import httpx
from langchain_core.messages import AIMessage

from usine_api.contracts import SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.graph.prompts import SPECIALIST_TASK
from usine_api.models import ModelSettings, chat_model, current_session_id, retry_kwargs
from usine_api.observability import Prompts, chat_template


class ChatModelSpecialist:
    def __init__(
        self,
        settings: ModelSettings,
        *,
        http_client: httpx.AsyncClient | None = None,
        prompts: Prompts | None = None,
    ) -> None:
        self._prompts = prompts or Prompts()
        self._settings = settings
        self.identity = SpecialistIdentity(
            name=f"chat:{settings.model}",
            framework="langchain",
            framework_version=version("langchain-core"),
        )
        self._client = http_client or httpx.AsyncClient()

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        text, linked = self._prompts.get(SPECIALIST_TASK)
        model = chat_model(
            self._settings, http_client=self._client, session_id=current_session_id()
        ).bind(max_tokens=task.budget.max_tokens)
        chain: Any = (chat_template(text, linked) | model).with_retry(
            **retry_kwargs(self._settings)
        )
        reply: AIMessage = await chain.ainvoke({"input": task.task})
        tokens = reply.usage_metadata["total_tokens"] if reply.usage_metadata else 0
        return SpecialistOutput(
            answer=reply.text.strip(),
            identity=self.identity,
            tokens=tokens,
            tool_calls=0,
        )
