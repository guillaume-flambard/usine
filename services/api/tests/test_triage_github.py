"""Reading stale PRs and issues from GitHub as plain facts (ADR 0003, point 4)."""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import pytest

from usine_api.triage.github import GraphQLReader, TriagePolicy, load_policy

FIXTURES = Path(__file__).parent / "fixtures" / "triage"
NOW = datetime(2026, 11, 17, 8, 0, tzinfo=UTC)
POLICY = TriagePolicy(
    accounts=["guillaume-flambard", "memolabs-dev"],
    excluded_repos=["mediterranean-rescue", "sosmed-carto-recette"],
    excluded_owners=["dataforgoodfr"],
)

Handler = Callable[[dict[str, Any]], httpx.Response]


def fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / name).read_text())


def reader_with(handler: Handler) -> tuple[GraphQLReader, list[dict[str, Any]]]:
    seen: list[dict[str, Any]] = []

    def reply(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        body["token"] = request.headers["authorization"].removeprefix("Bearer ")
        seen.append(body)
        return handler(body)

    client = httpx.AsyncClient(transport=httpx.MockTransport(reply))
    tokens = {"guillaume-flambard": "t-gf", "memolabs-dev": "t-md"}
    return GraphQLReader(tokens, client=client), seen


def by_kind(body: dict[str, Any]) -> httpx.Response:
    query = body["variables"]["q"]
    if "is:pr" in query and "user:memolabs-dev" in query:
        return httpx.Response(200, json=fixture("search_prs.json"))
    if "is:issue" in query and "user:guillaume-flambard" in query:
        return httpx.Response(200, json=fixture("search_issues.json"))
    return httpx.Response(200, json={"data": {"search": empty()}})


def empty() -> dict[str, Any]:
    return {"issueCount": 0, "pageInfo": {"hasNextPage": False, "endCursor": None}, "nodes": []}


async def test_reader_builds_items_from_search() -> None:
    reader, seen = reader_with(by_kind)
    snap = await reader.stale(POLICY, NOW)
    pr = next(i for i in snap.items if i.kind == "pr" and i.number == 41)
    assert pr.ci == "failure" and pr.conflicting is True and pr.author == "dependabot"
    assert pr.repo == "memolabs-dev/usine"
    draft = next(i for i in snap.items if i.kind == "pr" and i.number == 12)
    assert draft.is_draft and draft.last_commit_at == datetime(2026, 10, 20, 9, 0, tzinfo=UTC)
    assert draft.ci == "none"
    issue = next(i for i in snap.items if i.kind == "issue" and i.number == 7)
    assert issue.closed_by_merged_pr == "https://github.com/guillaume-flambard/lab-infra/pull/52"
    assert issue.labels == ("P2",)
    # The thresholds travel in the search query, never in a model.
    queries = [body["variables"]["q"] for body in seen]
    assert "is:open is:pr user:memolabs-dev created:<2026-11-15" in queries
    assert "is:open is:issue user:guillaume-flambard updated:<2026-11-03" in queries
    assert snap.incomplete == []


async def test_excluded_repos_never_leave_the_reader() -> None:
    reader, _ = reader_with(by_kind)
    snap = await reader.stale(POLICY, NOW)
    assert snap.items
    assert not any(POLICY.excludes(item.repo) for item in snap.items)
    assert not any(item.repo.endswith("/sosmed-carto-recette") for item in snap.items)


def test_policy_excludes_by_name_owner_or_full_name() -> None:
    policy = TriagePolicy(
        accounts=["a"],
        excluded_repos=["mediterranean-rescue", "a/private-thing"],
        excluded_owners=["dataforgoodfr"],
    )
    assert policy.excludes("memolabs-dev/mediterranean-rescue")
    assert policy.excludes("guillaume-flambard/mediterranean-rescue")
    assert policy.excludes("dataforgoodfr/anything")
    assert policy.excludes("a/private-thing")
    assert not policy.excludes("b/private-thing")
    assert not policy.excludes("memolabs-dev/usine")


def test_shipped_policy_reads() -> None:
    policy = load_policy(Path(__file__).parents[3] / "config" / "triage.yaml")
    assert policy.accounts == ["guillaume-flambard", "memolabs-dev"]
    assert policy.excludes("memolabs-dev/mediterranean-rescue")
    assert (policy.pr_after_days, policy.issue_after_days, policy.draft_after_days) == (2, 14, 14)


async def test_reader_follows_pages_and_flags_incomplete() -> None:
    def paged(body: dict[str, Any]) -> httpx.Response:
        query = body["variables"]["q"]
        if not ("is:pr" in query and "user:memolabs-dev" in query):
            return httpx.Response(200, json={"data": {"search": empty()}})
        after = body["variables"].get("after")
        start = 0 if after is None else int(after)
        count = 100 if start == 0 else 30
        nodes = [pr_node(start + n) for n in range(count)]
        return httpx.Response(
            200,
            json={
                "data": {
                    "search": {
                        # GitHub knows of more than it will page through.
                        "issueCount": 1200,
                        "pageInfo": {"hasNextPage": start == 0, "endCursor": str(start + count)},
                        "nodes": nodes,
                    }
                }
            },
        )

    reader, _ = reader_with(paged)
    snap = await reader.stale(POLICY, NOW)
    assert len(snap.items) == 130
    assert any("incomplet" in reason for reason in snap.incomplete)


async def test_unreadable_account_does_not_stop_the_read() -> None:
    def refuse_one(body: dict[str, Any]) -> httpx.Response:
        if "user:guillaume-flambard" in body["variables"]["q"]:
            return httpx.Response(403, json={"message": "Resource not accessible"})
        return by_kind(body)

    reader, _ = reader_with(refuse_one)
    snap = await reader.stale(POLICY, NOW)
    assert any(item.repo == "memolabs-dev/usine" for item in snap.items)
    assert any("guillaume-flambard" in reason for reason in snap.incomplete)


async def test_graphql_errors_are_reported_not_raised() -> None:
    def broken(body: dict[str, Any]) -> httpx.Response:
        return httpx.Response(200, json={"errors": [{"message": "Something went wrong"}]})

    reader, _ = reader_with(broken)
    snap = await reader.stale(POLICY, NOW)
    assert snap.items == []
    assert len(snap.incomplete) == 4


@pytest.mark.parametrize(
    ("state", "expected"), [("OPEN", True), ("CLOSED", False), ("MERGED", False)]
)
async def test_current_reads_state_and_last_update(state: str, expected: bool) -> None:
    def answer(body: dict[str, Any]) -> httpx.Response:
        assert body["variables"] == {"owner": "memolabs-dev", "name": "usine", "number": 41}
        found = {"state": state, "updatedAt": "2026-11-16T10:00:00Z"}
        return httpx.Response(200, json={"data": {"repository": {"issueOrPullRequest": found}}})

    reader, _ = reader_with(answer)
    now = await reader.current("memolabs-dev/usine", 41)
    assert now.open is expected
    assert now.updated_at == datetime(2026, 11, 16, 10, 0, tzinfo=UTC)


def pr_node(number: int) -> dict[str, Any]:
    return {
        "__typename": "PullRequest",
        "number": number,
        "title": f"PR {number}",
        "url": f"https://github.com/memolabs-dev/navirox/pull/{number}",
        "createdAt": "2026-11-01T10:00:00Z",
        "updatedAt": "2026-11-01T10:00:00Z",
        "isDraft": False,
        "mergeable": "MERGEABLE",
        "author": {"login": "guillaume-flambard"},
        "labels": {"nodes": []},
        "repository": {"nameWithOwner": "memolabs-dev/navirox"},
        "commits": {"nodes": []},
    }


async def test_each_account_is_read_with_its_own_token() -> None:
    reader, seen = reader_with(by_kind)
    await reader.stale(POLICY, NOW)
    for body in seen:
        account = (
            "memolabs-dev"
            if "user:memolabs-dev" in body["variables"]["q"]
            else "guillaume-flambard"
        )
        assert body["token"] == {"guillaume-flambard": "t-gf", "memolabs-dev": "t-md"}[account]


async def test_an_account_without_token_is_said_not_guessed() -> None:
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: by_kind(json.loads(r.content)))
    )
    reader = GraphQLReader({"memolabs-dev": "t-md"}, client=client)
    snap = await reader.stale(POLICY, NOW)
    assert all(item.repo.startswith("memolabs-dev/") for item in snap.items)
    assert any("aucun jeton pour guillaume-flambard" in reason for reason in snap.incomplete)


async def test_only_a_merged_pr_that_closes_the_issue_resolves_it() -> None:
    reader, _ = reader_with(by_kind)
    snap = await reader.stale(POLICY, NOW)
    mentioned = next(i for i in snap.items if i.kind == "issue" and i.number == 21)
    assert mentioned.closed_by_merged_pr is None
    assert (
        mentioned.mentioned_by_merged_pr
        == "https://github.com/guillaume-flambard/lab-infra/pull/61"
    )


async def test_partial_graphql_errors_keep_what_was_readable() -> None:
    def partial(body: dict[str, Any]) -> httpx.Response:
        if "is:pr" in body["variables"]["q"] and "user:memolabs-dev" in body["variables"]["q"]:
            payload = fixture("search_prs.json")
            payload["data"]["search"]["nodes"].append(None)
            payload["errors"] = [{"message": "Resource not accessible by personal access token"}]
            return httpx.Response(200, json=payload)
        return httpx.Response(200, json={"data": {"search": empty()}})

    reader, _ = reader_with(partial)
    snap = await reader.stale(POLICY, NOW)
    assert any(i.number == 41 for i in snap.items)
    assert any(
        "illisible" in reason and "user:memolabs-dev" in reason for reason in snap.incomplete
    )
