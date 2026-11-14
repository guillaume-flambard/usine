"""The supervisor graph (MEM-11).

A supervisor receives the brief and splits it into sub-tasks; each sub-task goes
to a specialist; the results are gathered. The fan-out is dynamic: LangGraph's
`Send` dispatches one specialist run per sub-task, so the shape of the run comes
from the brief instead of being fixed for every request.

Models stay out of this module. The planner and the specialist are injected,
behind two small protocols:

- in tests, deterministic fakes (no network);
- in the product, a chat model through LiteLLM (MEM-13) for the planner, and the
  `Specialist` contract (MEM-27) for the specialists.

Both protocols are async, and so are the nodes: a run streamed to a browser
must stop when the browser goes away (MEM-14). Cancelling an async node cancels
the model call in flight; a sync node would keep its thread running to the end.
"""

from __future__ import annotations

from typing import Annotated, Any, Protocol, TypedDict

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import Send

from usine_api.contracts import Budget, SpecialistInput, SpecialistOutput

SUPERVISOR = "supervisor"
SPECIALIST = "specialist"
SYNTHESIZE = "synthesize"


class Planner(Protocol):
    async def plan(self, brief: str) -> list[str]:
        """Split the brief into independent sub-tasks (at least one)."""
        ...


class SpecialistRunner(Protocol):
    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        """Answer one sub-task."""
        ...


def collect_results(
    left: list[SpecialistOutput] | None, right: list[SpecialistOutput] | None
) -> list[SpecialistOutput]:
    """Gather specialist outputs; an empty update starts a new run.

    A thread is checkpointed (MEM-12) and a chat sends every new message on the
    same thread. With a plain `operator.add`, the second run would synthesize
    the first run's results too. The supervisor resets with `[]`; specialists
    always add one output, never an empty list.
    """
    if not right:
        return []
    return [*(left or []), *right]


class RunState(TypedDict, total=False):
    brief: str
    subtasks: list[str]
    results: Annotated[list[SpecialistOutput], collect_results]
    answer: str


class SubtaskState(TypedDict):
    """What a single specialist run receives through `Send`."""

    task: str


DEFAULT_BUDGET = Budget(max_tokens=4_000, max_seconds=60, max_tool_calls=8)


def build_graph(
    planner: Planner,
    specialist: SpecialistRunner,
    *,
    checkpointer: BaseCheckpointSaver[Any] | None = None,
    budget: Budget = DEFAULT_BUDGET,
) -> CompiledStateGraph[RunState, None, RunState, RunState]:
    async def supervise(state: RunState) -> RunState:
        subtasks = [task.strip() for task in await planner.plan(state["brief"]) if task.strip()]
        # A planner that returns nothing must not end the run silently: the
        # brief itself becomes the single sub-task.
        return {"subtasks": subtasks or [state["brief"]], "results": []}

    def dispatch(state: RunState) -> list[Send]:
        return [Send(SPECIALIST, {"task": task}) for task in state["subtasks"]]

    async def run_specialist(state: SubtaskState) -> RunState:
        output = await specialist.run(SpecialistInput(task=state["task"], budget=budget))
        return {"results": [output]}

    def synthesize(state: RunState) -> RunState:
        return {"answer": "\n\n".join(result.answer for result in state["results"])}

    graph = StateGraph(RunState)
    graph.add_node(SUPERVISOR, supervise)
    graph.add_node(SPECIALIST, run_specialist)
    graph.add_node(SYNTHESIZE, synthesize)
    graph.add_edge(START, SUPERVISOR)
    graph.add_conditional_edges(SUPERVISOR, dispatch, [SPECIALIST])
    graph.add_edge(SPECIALIST, SYNTHESIZE)
    graph.add_edge(SYNTHESIZE, END)
    return graph.compile(checkpointer=checkpointer)
