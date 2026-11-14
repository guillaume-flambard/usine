"""The Specialist contract: one role, any framework (MEM-27 fills it in).

LangChain, CrewAI, OpenAI Agents SDK, Pydantic AI and Claude Agent SDK each
implement the same role behind this interface, so a forked branch can swap one
for another (MEM-33) and the comparison is fair (MEM-34).

Tools are named, never addressed: a model never hands the service a URL to call.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class Budget(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    max_tokens: int = Field(gt=0)
    max_seconds: float = Field(gt=0)
    max_tool_calls: int = Field(ge=0)


class SpecialistIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = Field(min_length=1)
    framework: str = Field(min_length=1, description="e.g. langchain, crewai, openai-agents")
    framework_version: str = Field(min_length=1)


class SpecialistInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    task: str = Field(min_length=1)
    tools: tuple[str, ...] = Field(default=(), description="Tool names from the allow-list.")
    budget: Budget


class SpecialistOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    answer: str
    identity: SpecialistIdentity
    tokens: int = Field(ge=0)
    tool_calls: int = Field(ge=0)
