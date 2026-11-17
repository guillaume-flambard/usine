"""The triage graph: pre-triage, agents in parallel, one checklist gate (ADR 0003)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from usine_api.contracts import ProposedAction
from usine_api.graph.triage import build_triage_graph
from usine_api.triage.github import Current, Item, Snapshot, TriagePolicy
from usine_api.triage.judge import RepoVerdicts, TriageVerdict

NOW = datetime(2026, 11, 17, 8, 0, tzinfo=UTC)
POLICY = TriagePolicy(accounts=["memolabs-dev"], excluded_repos=["mediterranean-rescue"])
MERGED = "https://github.com/memolabs-dev/usine/pull/52"


def issue(number: int, repo: str = "memolabs-dev/usine", **facts: Any) -> Item:
    return Item(
        repo=repo,
        number=number,
        kind="issue",
        title=f"Issue {number}",
        url=f"https://github.com/{repo}/issues/{number}",
        author="guillaume-flambard",
        created_at=NOW - timedelta(days=60),
        updated_at=NOW - timedelta(days=30),
        **facts,
    )


class Reader:
    def __init__(self, snap: Snapshot) -> None:
        self.snap = snap

    async def stale(self, policy: TriagePolicy, now: datetime) -> Snapshot:
        return self.snap

    async def current(self, repo: str, number: int) -> Current:
        return Current(open=True, updated_at=NOW)


class Judge:
    """Closes every item it sees, with a proof, except in `broken` repos."""

    def __init__(self, broken: tuple[str, ...] = ()) -> None:
        self.broken = broken
        self.seen: list[str] = []

    async def judge(self, repo: str, items: list[Item]) -> RepoVerdicts:
        self.seen.append(repo)
        if repo in self.broken:
            raise RuntimeError("gateway timeout")
        return RepoVerdicts(
            verdicts=[
                TriageVerdict(
                    number=i.number,
                    decision="fermer",
                    motif="abandonne",
                    proof=i.url,
                    comment="Plus d'activité depuis un mois.",
                )
                for i in items
            ]
        )


class Executor:
    def __init__(self) -> None:
        self.done: list[dict[str, Any]] = []

    async def execute(self, action: ProposedAction) -> str:
        self.done.append(json.loads(action.preview))
        return "commentée et fermée"


def graph(snap: Snapshot, judge: Judge | None = None, executor: Executor | None = None) -> Any:
    return build_triage_graph(
        Reader(snap),
        judge or Judge(),
        executor or Executor(),
        POLICY,
        checkpointer=InMemorySaver(),
        clock=lambda: NOW,
    )


CONFIG = {"configurable": {"thread_id": "tri-2026-11-17"}}


async def run_to_gate(snap: Snapshot, **parts: Any) -> tuple[Any, dict[str, Any]]:
    g = graph(snap, **parts)
    result = await g.ainvoke({"brief": "Tri du jour"}, CONFIG)
    return g, result


async def test_nothing_runs_without_approval() -> None:
    executor = Executor()
    g, result = await run_to_gate(
        Snapshot(items=[issue(1, closed_by_merged_pr=MERGED)]), executor=executor
    )
    assert "__interrupt__" in result
    assert executor.done == []


async def test_gate_is_a_checklist_rules_first() -> None:
    snap = Snapshot(items=[issue(2), issue(1, closed_by_merged_pr=MERGED)])
    _, result = await run_to_gate(snap)
    gate = result["__interrupt__"][0].value
    assert gate["checklist"] is True
    numbers = [json.loads(a["preview"])["number"] for a in gate["actions"]]
    assert numbers == [1, 2]  # the rule's proposal, then the agent's


async def test_unchecked_item_is_not_executed() -> None:
    executor = Executor()
    snap = Snapshot(items=[issue(1, closed_by_merged_pr=MERGED), issue(2)])
    g, _ = await run_to_gate(snap, executor=executor)
    await g.ainvoke(Command(resume={"decision": "approve", "selected": [0]}), CONFIG)
    assert [d["number"] for d in executor.done] == [1]


async def test_approve_without_selection_executes_all() -> None:
    executor = Executor()
    snap = Snapshot(items=[issue(1, closed_by_merged_pr=MERGED), issue(2)])
    g, _ = await run_to_gate(snap, executor=executor)
    final = await g.ainvoke(Command(resume={"decision": "approve"}), CONFIG)
    assert [d["number"] for d in executor.done] == [1, 2]
    assert [e["outcome"] for e in final["executed"]] == ["commentée et fermée"] * 2


async def test_reject_executes_nothing() -> None:
    executor = Executor()
    g, _ = await run_to_gate(
        Snapshot(items=[issue(1, closed_by_merged_pr=MERGED)]), executor=executor
    )
    await g.ainvoke(Command(resume={"decision": "reject", "reason": "pas aujourd'hui"}), CONFIG)
    assert executor.done == []


async def test_excluded_repo_never_reaches_judge_or_gate() -> None:
    judge = Judge()
    snap = Snapshot(items=[issue(3, repo="memolabs-dev/mediterranean-rescue"), issue(4)])
    _, result = await run_to_gate(snap, judge=judge)
    assert judge.seen == ["memolabs-dev/usine"]
    previews = [json.loads(a["preview"]) for a in result["__interrupt__"][0].value["actions"]]
    assert all("mediterranean-rescue" not in p["repo"] for p in previews)


async def test_judge_failure_on_one_repo_keeps_the_run() -> None:
    judge = Judge(broken=("memolabs-dev/navirox",))
    snap = Snapshot(items=[issue(5, repo="memolabs-dev/navirox"), issue(6)])
    _, result = await run_to_gate(snap, judge=judge)
    previews = [json.loads(a["preview"]) for a in result["__interrupt__"][0].value["actions"]]
    assert [p["number"] for p in previews] == [6]
    # The reason is readable_error's: internal details stay in the log.
    assert "Agents en échec (éléments gardés) : memolabs-dev/navirox" in result["answer"]


async def test_no_proposal_means_no_gate() -> None:
    fresh = issue(7).model_copy(update={"updated_at": NOW - timedelta(days=1)})
    _, result = await run_to_gate(Snapshot(items=[fresh]))
    assert "__interrupt__" not in result
    assert result["answer"].startswith("Rien à fermer aujourd'hui.")


async def test_summary_reports_incomplete_read() -> None:
    snap = Snapshot(
        items=[], incomplete=["« is:open is:pr user:x » illisible : GitHub a répondu 403"]
    )
    _, result = await run_to_gate(snap)
    assert "GitHub a répondu 403" in result["answer"]


async def test_an_edit_never_changes_what_a_triage_executes() -> None:
    executor = Executor()
    g, result = await run_to_gate(
        Snapshot(items=[issue(1, closed_by_merged_pr=MERGED)]), executor=executor
    )
    forged = dict(result["__interrupt__"][0].value["actions"][0])
    forged["preview"] = json.dumps({"repo": "someone/else", "number": 9, "kind": "issue"})
    await g.ainvoke(Command(resume={"decision": "edit", "actions": [forged]}), CONFIG)
    assert [d["repo"] for d in executor.done] == []


class RateLimitError(Exception):
    """Shaped like openai.RateLimitError: the gateway is saturated."""


class BusyJudge(Judge):
    """Saturated twice per repository, then answers; counts how many run at once."""

    def __init__(self) -> None:
        super().__init__()
        self.failures: dict[str, int] = {}
        self.running = 0
        self.peak = 0

    async def judge(self, repo: str, items: list[Item]) -> RepoVerdicts:
        import asyncio

        self.running += 1
        self.peak = max(self.peak, self.running)
        try:
            await asyncio.sleep(0.01)
            if self.failures.get(repo, 0) < 2:
                self.failures[repo] = self.failures.get(repo, 0) + 1
                raise RateLimitError("429 No deployments available")
            return await super().judge(repo, items)
        finally:
            self.running -= 1


async def test_judges_run_a_few_at_a_time_and_retry_when_saturated() -> None:
    judge = BusyJudge()
    repos = [f"memolabs-dev/r{n}" for n in range(8)]
    snap = Snapshot(items=[issue(n, repo=repo) for n, repo in enumerate(repos)])

    async def no_wait(seconds: float) -> None:
        return None

    g = build_triage_graph(
        Reader(snap),
        judge,
        Executor(),
        POLICY,
        checkpointer=InMemorySaver(),
        clock=lambda: NOW,
        sleep=no_wait,
    )
    result = await g.ainvoke({"brief": "Tri du jour"}, CONFIG)
    assert judge.peak <= 3
    assert len(result["__interrupt__"][0].value["actions"]) == 8
    assert "Agents en échec" not in result["answer"]


async def test_the_scene_gets_each_repository_its_verdict_and_items() -> None:
    from usine_api.chat_stream import ChatMessage, ChatRequest, run_stream

    snap = Snapshot(items=[issue(1, closed_by_merged_pr=MERGED), issue(2)])
    g = graph(snap, judge=Judge(broken=()))
    body = ChatRequest(
        id="tri-2026-11-17",
        messages=[ChatMessage(role="user", parts=[{"type": "text", "text": "Tri du jour"}])],
    )
    events = []
    async for chunk in run_stream(g, body):
        if chunk.startswith("data: {") and '"data-run-event"' in chunk:
            events.append(json.loads(chunk[6:])["data"])
    started = next(e for e in events if e["kind"] == "node-started" and e["node"] == "judge")
    assert started["data"]["task"] == "memolabs-dev/usine"
    finished = next(e for e in events if e["kind"] == "node-finished" and e["node"] == "judge")
    triage = finished["data"]["triage"]
    assert triage["repo"] == "memolabs-dev/usine"
    assert triage["counts"] == {"close": 1, "keep": 0, "nudge": 0}
    assert triage["items"] == [
        {
            "number": 2,
            "kind": "issue",
            "title": "Issue 2",
            "url": "https://github.com/memolabs-dev/usine/issues/2",
            "decision": "close",
            "motif": "abandonne",
            "proof": "https://github.com/memolabs-dev/usine/issues/2",
            "comment": "Plus d'activité depuis un mois.",
        }
    ]
    pre = next(e for e in events if e["kind"] == "node-finished" and e["node"] == "pretriage")
    assert pre["data"]["triage"]["read"] == 2
    assert pre["data"]["triage"]["counts"] == {"close": 1, "keep": 0, "judge": 1}


async def test_a_failed_judge_says_why_on_its_card() -> None:
    from usine_api.chat_stream import ChatMessage, ChatRequest, run_stream

    snap = Snapshot(items=[issue(5, repo="memolabs-dev/navirox"), issue(6)])
    g = graph(snap, judge=Judge(broken=("memolabs-dev/navirox",)))
    body = ChatRequest(
        id="tri-x", messages=[ChatMessage(role="user", parts=[{"type": "text", "text": "Tri"}])]
    )
    events = [
        json.loads(c[6:])["data"]
        async for c in run_stream(g, body)
        if c.startswith("data: {") and '"data-run-event"' in c
    ]
    failed = [
        e
        for e in events
        if e["kind"] == "node-finished" and e["node"] == "judge" and e["data"].get("failed")
    ]
    assert len(failed) == 1 and failed[0]["data"]["triage"]["repo"] == "memolabs-dev/navirox"
