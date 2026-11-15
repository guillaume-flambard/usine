"""Contracts between the layers of usine v2 (docs/architecture/v2.md).

These are the shapes other layers rely on. They start minimal and grow with
their milestone: RunEvent with M1 (MEM-14, MEM-17), Specialist with M3 (MEM-27).
"""

from .action import (
    GATE_TIMEOUT_SECONDS,
    ROLLBACK_NOTICE,
    GateDecision,
    GateRequest,
    ProposedAction,
)
from .run_event import RunEvent, RunEventKind
from .specialist import (
    Budget,
    SpecialistIdentity,
    SpecialistInput,
    SpecialistOutput,
    ToolName,
)

__all__ = [
    "GATE_TIMEOUT_SECONDS",
    "ROLLBACK_NOTICE",
    "GateDecision",
    "GateRequest",
    "ProposedAction",
    "Budget",
    "RunEvent",
    "RunEventKind",
    "SpecialistIdentity",
    "SpecialistInput",
    "SpecialistOutput",
    "ToolName",
]
