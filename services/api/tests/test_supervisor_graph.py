"""The supervisor graph (MEM-11): dynamic fan-out, no network, fake models."""

from __future__ import annotations

from pathlib import Path

from langgraph.checkpoint.memory import InMemorySaver

from usine_api.contracts import SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.graph import build_graph
from usine_api.graph.prompts import DEFAULTS, SPECIALIST_TASK, SUPERVISOR_PLAN, default_prompt

GRAPH_DIAGRAM = Path(__file__).resolve().parents[3] / "docs/architecture/supervisor-graph.mmd"


class FakePlanner:
    def __init__(self, subtasks: list[str]) -> None:
        self.subtasks = subtasks
        self.calls: list[str] = []

    def plan(self, brief: str) -> list[str]:
        self.calls.append(brief)
        return self.subtasks


class FakeSpecialist:
    identity = SpecialistIdentity(name="fake", framework="test", framework_version="0")

    def __init__(self) -> None:
        self.tasks: list[str] = []

    def run(self, task: SpecialistInput) -> SpecialistOutput:
        self.tasks.append(task.task)
        return SpecialistOutput(
            answer=f"fait : {task.task}", identity=self.identity, tokens=1, tool_calls=0
        )


def test_simple_brief_calls_one_specialist():
    planner, specialist = FakePlanner(["relire les portes"]), FakeSpecialist()
    result = build_graph(planner, specialist).invoke({"brief": "relire les portes"})
    assert planner.calls == ["relire les portes"]
    assert specialist.tasks == ["relire les portes"]
    assert result["answer"] == "fait : relire les portes"


def test_three_subtasks_fan_out_to_three_specialists():
    planner, specialist = FakePlanner(["a", "b", "c"]), FakeSpecialist()
    result = build_graph(planner, specialist).invoke({"brief": "trois choses"})
    assert sorted(specialist.tasks) == ["a", "b", "c"]
    assert len(result["results"]) == 3
    assert sorted(result["answer"].split("\n\n")) == ["fait : a", "fait : b", "fait : c"]


def test_empty_plan_falls_back_to_the_brief():
    planner, specialist = FakePlanner(["  ", ""]), FakeSpecialist()
    build_graph(planner, specialist).invoke({"brief": "un brief"})
    assert specialist.tasks == ["un brief"]


def test_run_is_checkpointed_and_specialist_outputs_survive_serialization():
    saver = InMemorySaver()
    app = build_graph(FakePlanner(["a", "b"]), FakeSpecialist(), checkpointer=saver)
    config = {"configurable": {"thread_id": "t-1"}}
    app.invoke({"brief": "deux choses"}, config)
    state = app.get_state(config)
    assert state.next == ()
    assert {output.answer for output in state.values["results"]} == {"fait : a", "fait : b"}
    assert len(list(app.get_state_history(config))) >= 4


def test_prompts_are_named_and_have_a_french_default():
    assert default_prompt(SUPERVISOR_PLAN).startswith("Tu es le superviseur")
    assert set(DEFAULTS) == {SUPERVISOR_PLAN, SPECIALIST_TASK}


def test_versioned_diagram_matches_the_graph():
    # The diagram in docs/ is generated from the graph; this fails if they drift.
    # Regenerate: uv run python -m usine_api.graph.diagram
    drawn = build_graph(FakePlanner([]), FakeSpecialist()).get_graph().draw_mermaid()
    assert GRAPH_DIAGRAM.read_text(encoding="utf-8") == drawn
