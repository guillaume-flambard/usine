"""The daily triage graph (ADR 0003).

pretriage ──Send per repo──> judge ──> synthesize ──> human_gate ──> act
     └──────(nothing to judge)──────────┘

- `pretriage` reads GitHub and applies the rules, no model involved;
- `judge` runs one LangChain agent per repository, in parallel (`Send`);
- `synthesize` turns every proposal into one checklist gate, rules first;
- `human_gate` stops on `interrupt()`; nothing has left the runtime yet;
- `act` comments then closes the checked items only.

The node names `synthesize`, `human_gate` and `act` are the chat graph's: the
SSE stream (`run_stream`) reads the answer and the gate from them, so the
atelier shows a triage run like any other.

Rulings live in the state as plain JSON, not as models: the checkpoint is
Postgres, and plain JSON survives every serializer.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Annotated, Any, TypedDict

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.errors import GraphBubbleUp
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import Send, interrupt

from usine_api.contracts import GateDecision, GateRequest, ProposedAction
from usine_api.errors import readable_error
from usine_api.triage.execute import ActionRunner, to_action
from usine_api.triage.github import GitHubReader, Item, TriagePolicy
from usine_api.triage.judge import Judge, RepoVerdicts, settle
from usine_api.triage.rules import Ruling, pretriage

from .supervisor import ACT, HUMAN_GATE, SYNTHESIZE

logger = logging.getLogger("usine.triage")

PRETRIAGE = "pretriage"
JUDGE = "judge"

#: Measured on 17 November 2026: 29 repositories judged at once saturated the
#: lab's gateway (429 on most of them). A few at a time, and a saturated call
#: waits and tries again.
MAX_PARALLEL_JUDGES = 3
SATURATED_RETRIES = 2
SATURATED_WAIT_SECONDS = 20.0


def _saturated(error: BaseException) -> bool:
    """A 429 from the gateway, whatever the client library calls it."""
    return any(kind.__name__ == "RateLimitError" for kind in type(error).__mro__) or (
        "429" in str(error)
    )


def gather(left: list[Any] | None, right: list[Any] | None) -> list[Any]:
    """Add up; an empty update from the first node starts the run afresh."""
    if right is None:
        return list(left or [])
    if not right and left:
        return []
    return [*(left or []), *right]


class TriageState(TypedDict, total=False):
    brief: str
    rulings: Annotated[list[dict[str, Any]], gather]
    failures: Annotated[list[str], gather]
    pending: dict[str, list[dict[str, Any]]]
    incomplete: list[str]
    answer: str
    proposed: list[ProposedAction]
    decision: dict[str, Any]
    executed: list[dict[str, str]]


class RepoState(TypedDict):
    repo: str
    items: list[dict[str, Any]]


def now_utc() -> datetime:
    return datetime.now(UTC)


def _plural(n: int, one: str, many: str) -> str:
    return one if n == 1 else many.format(n=n)


def build_triage_graph(
    reader: GitHubReader,
    judge: Judge,
    executor: ActionRunner,
    policy: TriagePolicy,
    *,
    checkpointer: BaseCheckpointSaver[Any] | None = None,
    clock: Callable[[], datetime] = now_utc,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    max_parallel: int = MAX_PARALLEL_JUDGES,
) -> CompiledStateGraph[TriageState, None, TriageState, TriageState]:
    slots = asyncio.Semaphore(max_parallel)

    async def judge_with_retry(repo: str, items: list[Item]) -> RepoVerdicts:
        attempt = 0
        while True:
            try:
                async with slots:
                    return await judge.judge(repo, items)
            except Exception as error:
                if attempt >= SATURATED_RETRIES or not _saturated(error):
                    raise
                attempt += 1
                await sleep(SATURATED_WAIT_SECONDS * attempt)

    async def read_and_sort(state: TriageState) -> TriageState:
        snap = await reader.stale(policy, clock())
        rulings = pretriage(snap.items, policy, clock())
        pending: dict[str, list[dict[str, Any]]] = {}
        decided: list[dict[str, Any]] = []
        for ruling in rulings:
            if ruling.group == "a_juger":
                pending.setdefault(ruling.item.repo, []).append(ruling.item.model_dump(mode="json"))
            else:
                decided.append(ruling.model_dump(mode="json"))
        return {
            "rulings": decided,
            "failures": [],
            "pending": pending,
            "incomplete": list(snap.incomplete),
        }

    def dispatch(state: TriageState) -> list[Send] | str:
        pending = state.get("pending") or {}
        if not pending:
            return SYNTHESIZE
        return [Send(JUDGE, {"repo": repo, "items": items}) for repo, items in pending.items()]

    async def judge_repo(state: RepoState) -> TriageState:
        items = [Item.model_validate(raw) for raw in state["items"]]
        try:
            answer = await judge_with_retry(state["repo"], items)
        except GraphBubbleUp:
            raise
        except Exception as error:  # noqa: BLE001 - one repository never stops the others
            logger.warning("triage judge failed on %s: %s", state["repo"], error, exc_info=error)
            return {
                "rulings": [settle(item, None).model_dump(mode="json") for item in items],
                "failures": [f"{state['repo']} : {readable_error(error)}"],
            }
        by_number = {verdict.number: verdict for verdict in answer.verdicts}
        return {
            "rulings": [settle(i, by_number.get(i.number)).model_dump(mode="json") for i in items]
        }

    def synthesize(state: TriageState) -> TriageState:
        rulings = [Ruling.model_validate(raw) for raw in state.get("rulings", [])]
        # Never propose what policy excludes, whatever reached the state.
        closing = [r for r in rulings if r.group == "evident" and not policy.excludes(r.item.repo)]
        closing.sort(key=lambda r: 0 if r.by == "rule" else 1)
        proposed = [to_action(r) for r in closing]
        nudges = [r for r in rulings if r.by == "agent" and r.group == "a_garder" and r.comment]

        if proposed:
            n = len(proposed)
            parts = [
                _plural(
                    n,
                    "1 proposition attend votre accord : rien ne part avant.",
                    "{n} propositions attendent votre accord : rien ne part avant.",
                )
            ]
        else:
            parts = ["Rien à fermer aujourd'hui."]
        judged = sum(1 for r in rulings if r.by == "agent")
        kept = sum(1 for r in rulings if r.group == "a_garder")
        parts.append(
            _plural(len(rulings), "1 élément lu", "{n} éléments lus")
            + ", "
            + _plural(judged, "1 jugé par les agents", "{n} jugés par les agents")
            + ", "
            + _plural(kept, "1 gardé.", "{n} gardés.")
        )
        if nudges:
            parts.append(
                "À relancer à la main :\n"
                + "\n".join(f"- {r.item.repo}#{r.item.number} : {r.comment}" for r in nudges)
            )
        failures = state.get("failures") or []
        if failures:
            parts.append("Agents en échec (éléments gardés) : " + " ; ".join(failures))
        incomplete = state.get("incomplete") or []
        if incomplete:
            parts.append("Lecture incomplète : " + " ; ".join(incomplete))
        return {"answer": "\n\n".join(parts), "proposed": proposed, "decision": {}, "executed": []}

    def after_synthesis(state: TriageState) -> str:
        return HUMAN_GATE if state.get("proposed") else END

    def human_gate(state: TriageState) -> TriageState:
        # Replayed on resume: nothing before `interrupt()` may have an effect.
        request = GateRequest(actions=state["proposed"], checklist=True)
        raw = interrupt(request.model_dump(mode="json"))
        return {"decision": GateDecision.model_validate(raw).model_dump(mode="json")}

    def after_gate(state: TriageState) -> str:
        # Only an approval acts. An edit would let the gate rewrite repo, number
        # and comment (review, 17 November 2026): the route refuses it, and the
        # graph does not trust the route alone.
        return ACT if state["decision"]["decision"] == "approve" else END

    async def act(state: TriageState) -> TriageState:
        decision = GateDecision.model_validate(state["decision"])
        offered = state["proposed"]
        chosen = (
            range(len(offered))
            if decision.selected is None
            else [i for i in decision.selected if 0 <= i < len(offered)]
        )
        executed = []
        for index in chosen:
            action = offered[index]
            try:
                outcome = await executor.execute(action)
            except Exception as error:  # noqa: BLE001 - one failure never stops the others
                outcome = f"échec : {readable_error(error)}"
            executed.append(
                {"kind": action.kind, "target": action.justification, "outcome": outcome}
            )
        return {"executed": executed}

    graph = StateGraph(TriageState)
    graph.add_node(PRETRIAGE, read_and_sort)
    graph.add_node(JUDGE, judge_repo)
    graph.add_node(SYNTHESIZE, synthesize)
    graph.add_node(HUMAN_GATE, human_gate)
    graph.add_node(ACT, act)
    graph.add_edge(START, PRETRIAGE)
    graph.add_conditional_edges(PRETRIAGE, dispatch, [JUDGE, SYNTHESIZE])
    graph.add_edge(JUDGE, SYNTHESIZE)
    graph.add_conditional_edges(SYNTHESIZE, after_synthesis, [HUMAN_GATE, END])
    graph.add_conditional_edges(HUMAN_GATE, after_gate, [ACT, END])
    graph.add_edge(ACT, END)
    return graph.compile(checkpointer=checkpointer)
