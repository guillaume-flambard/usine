"""Irreversible actions and the human gate in front of them (MEM-20).

An action that leaves the runtime (an external write, a message sent, a pull
request) is never executed by the graph on its own: a `human_gate` node stops
the run with LangGraph's `interrupt()` and waits for a decision
(https://docs.langchain.com/oss/python/langgraph/interrupts).

Honesty rule (CLAUDE.md, guardrail 1): rolling a run back restores its state,
not the world. The notice below travels with every gate request, so the screen
says it where the decision is taken.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ActionKind = Literal["external_write", "send", "pull_request"]

#: Shown with every gate. In French: read by the person who decides.
ROLLBACK_NOTICE = (
    "Revenir en arrière restaure l'état du run, pas le monde : une action déjà "
    "exécutée (un envoi, une écriture, une PR) n'est pas défaite."
)

#: How long a gate waits. Past it, a decision counts as a rejection.
GATE_TIMEOUT_SECONDS = 24 * 3600


class ProposedAction(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: ActionKind
    target: str = Field(min_length=1, description="Named target, never an address.")
    justification: str = Field(min_length=1)
    preview: str = Field(description="What would leave the runtime: a diff, a message.")


class GateRequest(BaseModel):
    """The interrupt payload: what the person is asked to decide."""

    model_config = ConfigDict(extra="forbid")

    actions: list[ProposedAction] = Field(min_length=1)
    notice: str = ROLLBACK_NOTICE
    expires_after_seconds: int = GATE_TIMEOUT_SECONDS
    #: One box per action, all checked: the person approves a selection (ADR 0003).
    checklist: bool = False


class GateDecision(BaseModel):
    """Approve, reject with a reason, or edit the actions then approve them.

    On a checklist gate, `selected` names the approved actions by index;
    `None` approves them all.
    """

    model_config = ConfigDict(extra="forbid")

    decision: Literal["approve", "reject", "edit"]
    reason: str | None = None
    actions: list[ProposedAction] | None = None
    selected: list[int] | None = None

    @model_validator(mode="after")
    def _complete(self) -> GateDecision:
        if self.decision == "reject" and not (self.reason and self.reason.strip()):
            raise ValueError("a rejection says why")
        if self.decision == "edit" and not self.actions:
            raise ValueError("an edit gives the actions to execute")
        if self.decision != "edit" and self.actions is not None:
            raise ValueError("only an edit carries actions")
        if self.selected is not None:
            if self.decision != "approve":
                raise ValueError("only an approval selects actions")
            if len(set(self.selected)) != len(self.selected) or min(self.selected, default=0) < 0:
                raise ValueError("a selection names each action once, by its index")
        return self
