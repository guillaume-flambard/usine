"""The real planner of the supervisor graph: a chat model with structured output."""

from __future__ import annotations

from typing import Any

import httpx
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from usine_api.graph.prompts import SUPERVISOR_PLAN, default_prompt
from usine_api.models import ModelSettings, chat_model, retry_kwargs


class Plan(BaseModel):
    """What the supervisor answers: independent sub-tasks, one per specialist."""

    subtasks: list[str] = Field(min_length=1, max_length=8)


class ChatModelPlanner:
    def __init__(
        self, settings: ModelSettings, *, http_client: httpx.AsyncClient | None = None
    ) -> None:
        # Tool calling, not json_schema (ChatOpenAI's default): every LiteLLM
        # route supports tools, not every one supports response_format, and the
        # lab already learned to carry structure through tools (CLAUDE.md).
        structured = chat_model(settings, http_client=http_client).with_structured_output(
            Plan, method="function_calling"
        )
        self._runnable: Any = structured.with_retry(**retry_kwargs(settings))

    async def plan(self, brief: str) -> list[str]:
        messages = [SystemMessage(default_prompt(SUPERVISOR_PLAN)), HumanMessage(brief)]
        result: Plan | None = await self._runnable.ainvoke(messages)
        # A model may answer in plain text instead of calling the tool: seen on
        # 2026-11-14 with "Bonjour" on lab-fast, where `with_structured_output`
        # returns None. No plan means no sub-task; the supervisor then runs the
        # brief itself (supervisor.py).
        return result.subtasks if result is not None else []
