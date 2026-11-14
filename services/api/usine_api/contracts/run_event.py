"""The run event: the archive format of a run.

Rule kept from v1 (CLAUDE.md, architecture rule 2): an event never references
a live object and never carries an absolute date, only `at`, the time elapsed
since the start of the run. A run exported then replayed rebuilds the same read
model without a kernel, a model or a network. Whatever the screen needs must be
in the stream.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RunEventKind(StrEnum):
    """Event kinds. The list grows with M1 (graph nodes) and M2 (gates, forks)."""

    RUN_STARTED = "run-started"
    NODE_STARTED = "node-started"
    NODE_FINISHED = "node-finished"
    REASONING_STARTED = "reasoning-started"
    REASONING_SETTLED = "reasoning-settled"
    TOOL_CALLED = "tool-called"
    GATE_OPENED = "gate-opened"
    GATE_DECIDED = "gate-decided"
    RUN_FINISHED = "run-finished"


class RunEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: RunEventKind
    at: float = Field(ge=0, description="Seconds elapsed since the start of the run.")
    node: str | None = Field(default=None, description="Graph node name, when it applies.")
    data: dict[str, Any] = Field(default_factory=dict, description="Plain JSON only.")
