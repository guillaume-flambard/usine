"""The real planner of the supervisor graph: a chat model with structured output."""

from __future__ import annotations

from typing import Any

import httpx
from pydantic import BaseModel, Field

from usine_api.graph.prompts import SUPERVISOR_PLAN
from usine_api.models import ModelSettings, chat_model, current_session_id, retry_kwargs
from usine_api.observability import Prompts, chat_template


class Plan(BaseModel):
    """What the supervisor answers: independent sub-tasks, one per specialist."""

    subtasks: list[str] = Field(min_length=1, max_length=8)


class ChatModelPlanner:
    def __init__(
        self,
        settings: ModelSettings,
        *,
        http_client: httpx.AsyncClient | None = None,
        prompts: Prompts | None = None,
    ) -> None:
        self._prompts = prompts or Prompts()
        self._settings = settings
        # One client for every call: the model is rebuilt per call to carry the
        # run's session, the connections are not.
        self._client = http_client or httpx.AsyncClient()

    async def plan(self, brief: str) -> list[str]:
        text, linked = self._prompts.get(SUPERVISOR_PLAN)
        model = chat_model(
            self._settings, http_client=self._client, session_id=current_session_id()
        )
        # Tool calling, not json_schema (ChatOpenAI's default): every LiteLLM
        # route supports tools, not every one supports response_format, and the
        # lab already learned to carry structure through tools (CLAUDE.md).
        structured: Any = model.with_structured_output(Plan, method="function_calling")
        chain = chat_template(text, linked) | structured.with_retry(**retry_kwargs(self._settings))
        result: Plan | None = await chain.ainvoke({"input": brief})
        # A model may answer in plain text instead of calling the tool: seen on
        # 2026-11-14 with "Bonjour" on lab-fast, where `with_structured_output`
        # returns None. No plan means no sub-task; the supervisor then runs the
        # brief itself (supervisor.py).
        return result.subtasks if result is not None else []
