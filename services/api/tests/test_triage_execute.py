"""Comment, then close, after the gate only (ADR 0003, points 3, 7 and 8)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from usine_api.contracts import ProposedAction
from usine_api.mcp_registry import Registry, RegistryRefusal
from usine_api.triage.execute import TriageExecutor, to_action
from usine_api.triage.github import Current, Item, Snapshot, TriagePolicy
from usine_api.triage.rules import Ruling

NOW = datetime(2026, 11, 17, 8, 0, tzinfo=UTC)
POLICY = TriagePolicy(accounts=["memolabs-dev"], excluded_repos=["mediterranean-rescue"])
REGISTRY = Registry.load(Path(__file__).parents[3] / "config" / "mcp-servers.yaml")
PROOF = "https://github.com/memolabs-dev/usine/pull/52"


def item(kind: str = "issue", repo: str = "memolabs-dev/usine", number: int = 7) -> Item:
    return Item(
        repo=repo,
        number=number,
        kind=kind,  # type: ignore[arg-type]
        title="Le timer ne part plus",
        url=f"https://github.com/{repo}/{'pull' if kind == 'pr' else 'issues'}/{number}",
        author="guillaume-flambard",
        created_at=NOW,
        updated_at=NOW,
    )


def ruling(kind: str = "issue", repo: str = "memolabs-dev/usine", motif: str = "resolu") -> Ruling:
    return Ruling(
        item=item(kind, repo),
        group="evident",
        motif=motif,  # type: ignore[arg-type]
        proof=PROOF,
        comment="Fermée par le tri quotidien de l'usine : résolue par " + PROOF + ".",
    )


class FakeMcp:
    def __init__(self, answers: dict[str, str] | None = None) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.answers = answers or {}

    async def execute(self, action: ProposedAction) -> str:
        self.calls.append((action.target, json.loads(action.preview)))
        return self.answers.get(action.target, "exécutée : ok")


class FakeReader:
    def __init__(self, open_: bool = True, updated_at: datetime = NOW) -> None:
        self.now = Current(open=open_, updated_at=updated_at)

    async def stale(self, policy: TriagePolicy, now: datetime) -> Snapshot:
        return Snapshot()

    async def current(self, repo: str, number: int) -> Current:
        return self.now


def test_action_carries_what_the_gate_shows() -> None:
    action = to_action(ruling())
    assert action.target == "github/triage"
    assert "memolabs-dev/usine#7" in action.justification and PROOF in action.justification
    assert json.loads(action.preview) == {
        "repo": "memolabs-dev/usine",
        "number": 7,
        "kind": "issue",
        "title": "Le timer ne part plus",
        "url": "https://github.com/memolabs-dev/usine/issues/7",
        "motif": "resolu",
        "proof": PROOF,
        "comment": "Fermée par le tri quotidien de l'usine : résolue par " + PROOF + ".",
        "state_reason": "completed",
        "updated_at": "2026-11-17T08:00:00Z",
    }
    assert json.loads(to_action(ruling(motif="doublon")).preview)["state_reason"] == "not_planned"


async def test_comment_then_close_issue() -> None:
    mcp = FakeMcp()
    outcome = await TriageExecutor({"memolabs-dev": mcp}.get, FakeReader(), POLICY).execute(
        to_action(ruling())
    )
    assert outcome == "commentée et fermée"
    assert mcp.calls == [
        (
            "github/add_issue_comment",
            {
                "owner": "memolabs-dev",
                "repo": "usine",
                "issue_number": 7,
                "body": "Fermée par le tri quotidien de l'usine : résolue par " + PROOF + ".",
            },
        ),
        (
            "github/issue_write",
            {
                "method": "update",
                "owner": "memolabs-dev",
                "repo": "usine",
                "issue_number": 7,
                "state": "closed",
                "state_reason": "completed",
            },
        ),
    ]


async def test_comment_then_close_pr() -> None:
    mcp = FakeMcp()
    await TriageExecutor({"memolabs-dev": mcp}.get, FakeReader(), POLICY).execute(
        to_action(ruling("pr"))
    )
    assert [target for target, _ in mcp.calls] == [
        "github/add_issue_comment",
        "github/update_pull_request",
    ]
    assert mcp.calls[1][1] == {
        "owner": "memolabs-dev",
        "repo": "usine",
        "pullNumber": 7,
        "state": "closed",
    }


async def test_already_closed_item_is_skipped() -> None:
    mcp = FakeMcp()
    outcome = await TriageExecutor(
        {"memolabs-dev": mcp}.get, FakeReader(open_=False), POLICY
    ).execute(to_action(ruling()))
    assert mcp.calls == [] and outcome.startswith("déjà fermé")


async def test_close_failure_after_comment_is_reported() -> None:
    mcp = FakeMcp({"github/issue_write": "échec : Resource not accessible"})
    outcome = await TriageExecutor({"memolabs-dev": mcp}.get, FakeReader(), POLICY).execute(
        to_action(ruling())
    )
    assert outcome == "commentée, non fermée : échec : Resource not accessible"


async def test_comment_failure_stops_the_close() -> None:
    mcp = FakeMcp({"github/add_issue_comment": "échec : 404"})
    outcome = await TriageExecutor({"memolabs-dev": mcp}.get, FakeReader(), POLICY).execute(
        to_action(ruling())
    )
    assert [target for target, _ in mcp.calls] == ["github/add_issue_comment"]
    assert outcome == "rien envoyé : échec : 404"


async def test_excluded_repo_is_refused_before_anything() -> None:
    mcp = FakeMcp()
    action = to_action(ruling(repo="memolabs-dev/mediterranean-rescue"))
    outcome = await TriageExecutor({"memolabs-dev": mcp}.get, FakeReader(), POLICY).execute(action)
    assert mcp.calls == [] and outcome.startswith("refusée")


async def test_unreadable_preview_is_refused() -> None:
    action = to_action(ruling()).model_copy(update={"preview": "pas du json"})
    outcome = await TriageExecutor({"memolabs-dev": FakeMcp()}.get, FakeReader(), POLICY).execute(
        action
    )
    assert outcome.startswith("refusée")


def test_merge_pull_request_is_refused() -> None:
    with pytest.raises(RegistryRefusal):
        REGISTRY.allowed("github", "merge_pull_request")


def test_comment_and_pr_update_are_irreversible() -> None:
    assert REGISTRY.allowed("github", "add_issue_comment") == "irreversible"
    assert REGISTRY.allowed("github", "update_pull_request") == "irreversible"
    assert REGISTRY.allowed("github", "issue_write") == "irreversible"
    assert REGISTRY.allowed("github", "pull_request_read") == "read"


async def test_item_updated_since_triage_is_skipped() -> None:
    mcp = FakeMcp()
    reader = FakeReader(updated_at=NOW + timedelta(hours=3))
    outcome = await TriageExecutor({"memolabs-dev": mcp}.get, reader, POLICY).execute(
        to_action(ruling())
    )
    assert mcp.calls == [] and outcome.startswith("modifié depuis le tri")


async def test_comment_is_defused_again_at_execution() -> None:
    mcp = FakeMcp()
    action = to_action(ruling().model_copy(update={"comment": "cc @bob"}))
    await TriageExecutor({"memolabs-dev": mcp}.get, FakeReader(), POLICY).execute(action)
    assert mcp.calls[0][1]["body"] == "cc @\u2060bob"


async def test_comment_timeout_is_reported_as_unknown() -> None:
    mcp = FakeMcp({"github/add_issue_comment": "état inconnu : pas de réponse en 30 s"})
    outcome = await TriageExecutor({"memolabs-dev": mcp}.get, FakeReader(), POLICY).execute(
        to_action(ruling())
    )
    assert outcome.startswith("état inconnu, non fermée")
    assert len(mcp.calls) == 1


def test_the_chat_never_reaches_the_triage_tools() -> None:
    from usine_api.triage.service import TRIAGE_ONLY

    chat = REGISTRY.without(TRIAGE_ONLY)
    for tool in ("add_issue_comment", "update_pull_request"):
        with pytest.raises(RegistryRefusal):
            chat.allowed("github", tool)
    assert chat.allowed("github", "issue_write") == "irreversible"


async def test_an_owner_without_token_is_refused() -> None:
    mcp = FakeMcp()
    action = to_action(ruling(repo="guillaume-flambard/lab-infra"))
    outcome = await TriageExecutor({"memolabs-dev": mcp}.get, FakeReader(), POLICY).execute(action)
    assert mcp.calls == [] and outcome == "refusée : aucun jeton pour guillaume-flambard"
