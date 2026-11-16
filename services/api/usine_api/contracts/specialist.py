"""The Specialist contract: one role, any framework (MEM-27 fills it in).

LangChain, CrewAI, OpenAI Agents SDK, Pydantic AI and Claude Agent SDK each
implement the same role behind this interface, so a forked branch can swap one
for another (MEM-33) and the comparison is fair (MEM-34).

Tools are named, never addressed: a model never hands the service a URL to call.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from .action import ProposedAction

#: A tool is a name from the allow-list, never an address (MEM-27): a model
#: must not be able to hand the service a URL to call. Lowercase, dot, dash and
#: underscore; no scheme, no slash, no port.
ToolName = Annotated[
    str,
    StringConstraints(pattern=r"^[a-z0-9][a-z0-9._-]{0,63}$", strip_whitespace=True),
]


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
    tools: tuple[ToolName, ...] = Field(
        default=(), description="Tool names from the allow-list, never addresses."
    )
    budget: Budget


class SpecialistOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    answer: str
    identity: SpecialistIdentity
    tokens: int = Field(ge=0)
    tool_calls: int = Field(ge=0)
    # Irreversible actions the specialist proposes; the graph never executes
    # one without a human decision (MEM-20).
    actions: tuple[ProposedAction, ...] = ()
    # The tool calls it made, by name (MEM-38): a trace says which tools ran.
    tools: tuple[str, ...] = ()
    # Why it did not finish, in words a person reads. A failed specialist does
    # not stop the others: the run goes on and says what is missing.
    failed: str | None = None
