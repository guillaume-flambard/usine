"""The supervisor graph (MEM-11): dynamic fan-out, no network, fake models."""

from __future__ import annotations

from pathlib import Path

from langgraph.checkpoint.memory import InMemorySaver

from usine_api.contracts import (
    ProposedAction,
    SpecialistIdentity,
    SpecialistInput,
    SpecialistOutput,
)
from usine_api.graph import build_graph
from usine_api.graph.prompts import DEFAULTS, SPECIALIST_TASK, SUPERVISOR_PLAN, default_prompt
from usine_api.specialists.node import subtask_of

GRAPH_DIAGRAM = Path(__file__).resolve().parents[3] / "docs/architecture/supervisor-graph.mmd"


class FakePlanner:
    def __init__(self, subtasks: list[str]) -> None:
        self.subtasks = subtasks
        self.calls: list[str] = []

    async def plan(self, brief: str) -> list[str]:
        self.calls.append(brief)
        return self.subtasks


class FakeSpecialist:
    identity = SpecialistIdentity(name="fake", framework="test", framework_version="0")

    def __init__(self) -> None:
        self.tasks: list[str] = []
        self.received: list[str] = []

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        self.received.append(task.task)
        subtask = subtask_of(task.task)  # the brief may come first
        self.tasks.append(subtask)
        return SpecialistOutput(
            answer=f"fait : {subtask}", identity=self.identity, tokens=1, tool_calls=0
        )


async def test_simple_brief_calls_one_specialist():
    planner, specialist = FakePlanner(["relire les portes"]), FakeSpecialist()
    result = await build_graph(planner, specialist).ainvoke({"brief": "relire les portes"})
    assert planner.calls == ["relire les portes"]
    assert specialist.tasks == ["relire les portes"]
    assert result["answer"] == "fait : relire les portes"


async def test_three_subtasks_fan_out_to_three_specialists():
    planner, specialist = FakePlanner(["a", "b", "c"]), FakeSpecialist()
    result = await build_graph(planner, specialist).ainvoke({"brief": "trois choses"})
    assert sorted(specialist.tasks) == ["a", "b", "c"]
    assert len(result["results"]) == 3
    lead, *agents = result["answer"].split("\n\n**Agent ")
    # The answer opens with what happens next, then each agent under its heading.
    assert lead == (
        "**En bref** : 3 agents ont terminé. Aucune action proposée : rien ne sera écrit."
    )
    assert sorted(a.split("**\n\n")[1] for a in agents) == ["fait : a", "fait : b", "fait : c"]


async def test_each_specialist_also_reads_the_brief():
    # A planner dropped "guillaume-flambard/usine" from a sub-task and the
    # specialist invented a repository (production, 16 November 2026).
    planner = FakePlanner(["proposer une issue"])
    specialist = FakeSpecialist()
    brief = "Lis deployment/README.md du dépôt guillaume-flambard/usine"
    await build_graph(planner, specialist).ainvoke({"brief": brief})
    [received] = specialist.received
    assert brief in received
    assert received.endswith("proposer une issue")


async def test_a_brief_equal_to_its_subtask_is_not_repeated():
    planner, specialist = FakePlanner(["relire les portes"]), FakeSpecialist()
    await build_graph(planner, specialist).ainvoke({"brief": "relire les portes"})
    assert specialist.received == ["relire les portes"]


async def test_empty_plan_falls_back_to_the_brief():
    planner, specialist = FakePlanner(["  ", ""]), FakeSpecialist()
    await build_graph(planner, specialist).ainvoke({"brief": "un brief"})
    assert specialist.tasks == ["un brief"]


async def test_run_is_checkpointed_and_specialist_outputs_survive_serialization():
    saver = InMemorySaver()
    app = build_graph(FakePlanner(["a", "b"]), FakeSpecialist(), checkpointer=saver)
    config = {"configurable": {"thread_id": "t-1"}}
    await app.ainvoke({"brief": "deux choses"}, config)
    state = await app.aget_state(config)
    assert state.next == ()
    assert {output.answer for output in state.values["results"]} == {"fait : a", "fait : b"}
    assert len(list(app.get_state_history(config))) >= 4


async def test_a_second_run_on_the_same_thread_answers_only_its_own_brief():
    # A chat sends every message on one thread: results must not pile up.
    saver = InMemorySaver()
    planner = FakePlanner(["a"])
    app = build_graph(planner, FakeSpecialist(), checkpointer=saver)
    config = {"configurable": {"thread_id": "t-2"}}
    await app.ainvoke({"brief": "premier"}, config)
    planner.subtasks = ["b"]
    second = await app.ainvoke({"brief": "second"}, config)
    assert second["answer"] == "fait : b"
    assert [output.answer for output in second["results"]] == ["fait : b"]


async def test_prompts_are_named_and_have_a_french_default():
    assert default_prompt(SUPERVISOR_PLAN).startswith("Tu es le superviseur")
    assert set(DEFAULTS) == {SUPERVISOR_PLAN, SPECIALIST_TASK}


async def test_versioned_diagram_matches_the_graph():
    # The diagram in docs/ is generated from the graph; this fails if they drift.
    # Regenerate: uv run python -m usine_api.graph.diagram
    drawn = build_graph(FakePlanner([]), FakeSpecialist()).get_graph().draw_mermaid()
    assert GRAPH_DIAGRAM.read_text(encoding="utf-8") == drawn


class ProposingSpecialist:
    """Every agent proposes the same issue, as three agents did in production."""

    identity = SpecialistIdentity(name="fake", framework="test", framework_version="0")

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        action = ProposedAction(
            kind="external_write",
            target="github/issue_write",
            justification="github/issue_write sur o/r",
            preview=f'{{"title": "{subtask_of(task.task)}"}}',
        )
        return SpecialistOutput(
            answer="fait", identity=self.identity, tokens=1, tool_calls=1, actions=(action,)
        )


async def test_one_proposal_per_action_reaches_the_person():
    # 16 November 2026: three agents proposed three near-identical issues, and
    # approving the gate would have opened all three.
    graph = build_graph(
        FakePlanner(["a", "b", "c"]), ProposingSpecialist(), checkpointer=InMemorySaver()
    )
    config = {"configurable": {"thread_id": "dedupe"}}
    await graph.ainvoke({"brief": "trois agents"}, config)
    state = await graph.aget_state(config)
    assert len(state.values["proposed"]) == 1
    assert "3 propositions pour 1 action" in state.values["answer"]
