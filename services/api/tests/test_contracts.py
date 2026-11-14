"""The contracts refuse what the architecture forbids (MEM-8)."""

import pytest
from pydantic import ValidationError

from usine_api.contracts import Budget, RunEvent, RunEventKind, SpecialistInput


def test_run_event_has_relative_time_only():
    event = RunEvent(kind=RunEventKind.NODE_STARTED, at=1.5, node="supervisor")
    assert event.at == 1.5
    with pytest.raises(ValidationError):
        RunEvent(kind=RunEventKind.NODE_STARTED, at=-1)


def test_run_event_refuses_unknown_fields():
    # An absolute timestamp sneaking in as an extra field is refused.
    with pytest.raises(ValidationError):
        RunEvent(kind=RunEventKind.RUN_STARTED, at=0, timestamp="2026-11-14T18:00:00Z")


def test_run_event_round_trips_through_json():
    event = RunEvent(kind=RunEventKind.TOOL_CALLED, at=2, data={"tool": "search_knowledge"})
    assert RunEvent.model_validate_json(event.model_dump_json()) == event


def test_specialist_input_needs_a_budget():
    budget = Budget(max_tokens=1000, max_seconds=30, max_tool_calls=5)
    task = SpecialistInput(task="relire les portes", tools=("search_knowledge",), budget=budget)
    assert task.tools == ("search_knowledge",)
    with pytest.raises(ValidationError):
        SpecialistInput(task="x", budget=Budget(max_tokens=0, max_seconds=1, max_tool_calls=0))
