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

from collections.abc import Mapping
from typing import Annotated, Any, Protocol, TypedDict, cast

from langchain_core.runnables import ensure_config
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import Send, interrupt

from usine_api.contracts import (
    Budget,
    GateDecision,
    GateRequest,
    ProposedAction,
    SpecialistOutput,
)
from usine_api.specialists import UnknownSpecialist
from usine_api.specialists.contract import Specialist
from usine_api.specialists.node import as_node

SUPERVISOR = "supervisor"
SPECIALIST = "specialist"
SYNTHESIZE = "synthesize"
HUMAN_GATE = "human_gate"
ACT = "act"


class Planner(Protocol):
    async def plan(self, brief: str) -> list[str]:
        """Split the brief into independent sub-tasks (at least one)."""
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


class ActionExecutor(Protocol):
    async def execute(self, action: ProposedAction) -> str:
        """Carry out one approved action; return what happened, in words."""
        ...


class DryRunExecutor:
    """The default: no external action is wired into the usine yet (M3, M4).

    It says so instead of pretending: an approved action is recorded as not
    carried out, and nothing leaves the runtime.
    """

    async def execute(self, action: ProposedAction) -> str:
        return f"non exécutée : aucun exécuteur branché pour « {action.kind} » vers {action.target}"


def named_specialist() -> str | None:
    """The specialist a run named for itself, if any (MEM-33)."""
    configured = ensure_config().get("configurable") or {}
    name = configured.get("specialist")
    return name if isinstance(name, str) and name else None


class RunState(TypedDict, total=False):
    brief: str
    subtasks: list[str]
    results: Annotated[list[SpecialistOutput], collect_results]
    answer: str
    # The human gate (MEM-20): what was proposed, what was decided, what ran.
    proposed: list[ProposedAction]
    decision: dict[str, Any]
    executed: list[dict[str, str]]


class SubtaskState(TypedDict):
    """What a single specialist run receives through `Send`."""

    task: str


# Measured on 16 November 2026: the tool agent reading one real README through
# GitHub's MCP server spent 6 488 tokens (the file comes back into its context).
# At 4 000, every real tool run stopped on the budget.
DEFAULT_BUDGET = Budget(max_tokens=16_000, max_seconds=60, max_tool_calls=8)


def build_graph(
    planner: Planner,
    specialist: Specialist,
    *,
    specialists: Mapping[str, Specialist] | None = None,
    checkpointer: BaseCheckpointSaver[Any] | None = None,
    budget: Budget = DEFAULT_BUDGET,
    executor: ActionExecutor | None = None,
) -> CompiledStateGraph[RunState, None, RunState, RunState]:
    act_with = executor or DryRunExecutor()

    async def supervise(state: RunState) -> RunState:
        subtasks = [task.strip() for task in await planner.plan(state["brief"]) if task.strip()]
        # A planner that returns nothing must not end the run silently: the
        # brief itself becomes the single sub-task.
        return {"subtasks": subtasks or [state["brief"]], "results": []}

    def dispatch(state: RunState) -> list[Send]:
        return [Send(SPECIALIST, {"task": task}) for task in state["subtasks"]]

    # The Specialist contract's adapter (MEM-27) is generic over the state it
    # reads; the
    # graph's node has a concrete shape, so this node is the one boundary.
    #
    # The hot swap (MEM-33): a run names its specialist in its own config, and
    # the node resolves it there. One graph for every framework, chosen per run
    # rather than per process, which is what a forked branch needs. A name that
    # is not loaded is an error, never a silent fallback to the default.
    default_task = as_node(specialist, budget)
    by_name = dict(specialists or {})

    async def run_specialist(state: SubtaskState) -> RunState:
        name = named_specialist()
        if name is None:
            return cast(RunState, await default_task(state))
        chosen = by_name.get(name)
        if chosen is None:
            raise UnknownSpecialist(name)
        return cast(RunState, await as_node(chosen, budget)(state))

    def synthesize(state: RunState) -> RunState:
        proposed = [action for result in state["results"] for action in result.actions]
        return {
            "answer": "\n\n".join(result.answer for result in state["results"]),
            "proposed": proposed,
            "decision": {},
            "executed": [],
        }

    def after_synthesis(state: RunState) -> str:
        return HUMAN_GATE if state.get("proposed") else END

    def human_gate(state: RunState) -> RunState:
        # Rerun from the top on resume (LangGraph replays the node): nothing
        # before `interrupt()` may have an effect.
        request = GateRequest(actions=state["proposed"])
        raw = interrupt(request.model_dump(mode="json"))
        decision = GateDecision.model_validate(raw)
        return {"decision": decision.model_dump(mode="json")}

    def after_gate(state: RunState) -> str:
        return END if state["decision"]["decision"] == "reject" else ACT

    async def act(state: RunState) -> RunState:
        decision = GateDecision.model_validate(state["decision"])
        approved = decision.actions if decision.actions is not None else state["proposed"]
        executed = []
        for action in approved:
            outcome = await act_with.execute(action)
            executed.append({"kind": action.kind, "target": action.target, "outcome": outcome})
        return {"executed": executed}

    graph = StateGraph(RunState)
    graph.add_node(SUPERVISOR, supervise)
    graph.add_node(SPECIALIST, run_specialist)
    graph.add_node(SYNTHESIZE, synthesize)
    graph.add_node(HUMAN_GATE, human_gate)
    graph.add_node(ACT, act)
    graph.add_edge(START, SUPERVISOR)
    graph.add_conditional_edges(SUPERVISOR, dispatch, [SPECIALIST])
    graph.add_edge(SPECIALIST, SYNTHESIZE)
    graph.add_conditional_edges(SYNTHESIZE, after_synthesis, [HUMAN_GATE, END])
    graph.add_conditional_edges(HUMAN_GATE, after_gate, [ACT, END])
    graph.add_edge(ACT, END)
    return graph.compile(checkpointer=checkpointer)
