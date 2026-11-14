"""The first real specialist: one chat model call through LiteLLM (MEM-14).

It answers a sub-task with the `usine/specialist-task` prompt and nothing else:
no tools yet. The framework-specific specialists (CrewAI, OpenAI Agents SDK,
Pydantic AI, Claude Agent SDK) arrive with MEM-27 behind the same contract.
"""

from __future__ import annotations

from importlib.metadata import version
from typing import Any

import httpx
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from usine_api.contracts import SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.graph.prompts import SPECIALIST_TASK, default_prompt
from usine_api.models import ModelSettings, chat_model, retry_kwargs


class ChatModelSpecialist:
    def __init__(
        self, settings: ModelSettings, *, http_client: httpx.AsyncClient | None = None
    ) -> None:
        self.identity = SpecialistIdentity(
            name=f"chat:{settings.model}",
            framework="langchain",
            framework_version=version("langchain-core"),
        )
        model = chat_model(settings, http_client=http_client)
        self._runnable: Any = model.with_retry(**retry_kwargs(settings))

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        messages = [SystemMessage(default_prompt(SPECIALIST_TASK)), HumanMessage(task.task)]
        reply: AIMessage = await self._runnable.ainvoke(messages, max_tokens=task.budget.max_tokens)
        tokens = reply.usage_metadata["total_tokens"] if reply.usage_metadata else 0
        return SpecialistOutput(
            answer=reply.text.strip(),
            identity=self.identity,
            tokens=tokens,
            tool_calls=0,
        )
