"""Les faits du tri, lus sur GitHub, sans modèle (ADR 0003, point 4).

Le pré-tri ne range un élément qu'à partir de ce que GitHub dit de lui : âge,
auteur, CI, conflit, PR fusionnée qui le cite. Ces faits viennent d'une
recherche GraphQL par compte et par genre, et les seuils sont dans la requête
elle-même (`created:<` pour une PR, `updated:<` pour une issue).

Champs vérifiés le 17 novembre 2026 contre l'API réelle (requête de lecture sur
`memolabs-dev` et `guillaume-flambard`) et la référence
https://docs.github.com/en/graphql/reference/objects : `search`, `issueCount`,
`pageInfo`, `PullRequest.isDraft`, `mergeable`, `commits.statusCheckRollup`,
`Issue.timelineItems(CROSS_REFERENCED_EVENT)`.

Ce que ce module ne fait pas : décider. Il lit, et dit ce qu'il n'a pas pu lire.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Literal, Protocol

import httpx
import yaml
from pydantic import BaseModel, ConfigDict

GRAPHQL_URL = "https://api.github.com/graphql"

#: GitHub's search stops at 1000 results, whatever `issueCount` says.
SEARCH_CAP = 1000

#: The status rollup as the screen reads it.
CI_STATES: dict[str, Literal["success", "failure", "pending"]] = {
    "SUCCESS": "success",
    "FAILURE": "failure",
    "ERROR": "failure",
    "PENDING": "pending",
    "EXPECTED": "pending",
}

PR_FIELDS = """
  ... on PullRequest {
    __typename number title url createdAt updatedAt isDraft mergeable
    author { login }
    labels(first: 20) { nodes { name } }
    repository { nameWithOwner }
    commits(last: 1) { nodes { commit { committedDate statusCheckRollup { state } } } }
  }
"""

ISSUE_FIELDS = """
  ... on Issue {
    __typename number title url createdAt updatedAt
    author { login }
    labels(first: 20) { nodes { name } }
    repository { nameWithOwner }
    timelineItems(itemTypes: [CROSS_REFERENCED_EVENT], last: 20) {
      nodes { ... on CrossReferencedEvent { source { ... on PullRequest { merged url } } } }
    }
  }
"""

SEARCH_QUERY = """
query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { %s }
  }
}
"""

STATE_QUERY = """
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issueOrPullRequest(number: $number) {
      ... on Issue { state updatedAt }
      ... on PullRequest { state updatedAt }
    }
  }
}
"""


class TriagePolicy(BaseModel):
    """Who is read, what is never touched, and when an item counts as stale."""

    model_config = ConfigDict(extra="forbid")

    accounts: list[str]
    excluded_repos: list[str] = []
    excluded_owners: list[str] = []
    pr_after_days: int = 2
    issue_after_days: int = 14
    draft_after_days: int = 14

    def excludes(self, repo: str) -> bool:
        """`owner/name` is excluded by its owner, its full name, or its bare name."""
        owner, _, name = repo.partition("/")
        excluded = {entry.lower() for entry in self.excluded_repos}
        return (
            owner.lower() in {o.lower() for o in self.excluded_owners}
            or repo.lower() in excluded
            or name.lower() in excluded
        )


def load_policy(path: Path) -> TriagePolicy:
    return TriagePolicy.model_validate(yaml.safe_load(path.read_text()))


class Item(BaseModel):
    """One open PR or issue, and the facts GitHub gives about it."""

    model_config = ConfigDict(frozen=True)

    repo: str
    number: int
    kind: Literal["pr", "issue"]
    title: str
    url: str
    author: str
    labels: tuple[str, ...] = ()
    created_at: datetime
    updated_at: datetime
    is_draft: bool = False
    last_commit_at: datetime | None = None
    ci: Literal["success", "failure", "pending", "none"] = "none"
    conflicting: bool = False
    closed_by_merged_pr: str | None = None


class Snapshot(BaseModel):
    items: list[Item] = []
    #: What could not be read, in words: the run says it, it never hides it.
    incomplete: list[str] = []


class Current(BaseModel):
    """An item as GitHub sees it now, read again just before acting."""

    open: bool
    updated_at: datetime


class GitHubReader(Protocol):
    async def stale(self, policy: TriagePolicy, now: datetime) -> Snapshot: ...

    async def current(self, repo: str, number: int) -> Current: ...


class ReadFailure(Exception):
    """GitHub answered, but not with data: a refusal, or GraphQL errors."""


def _author(node: dict[str, Any]) -> str:
    login = str((node.get("author") or {}).get("login") or "ghost")
    # GraphQL says `dependabot`, REST says `dependabot[bot]`: one name.
    return login.removesuffix("[bot]")


def _item(node: dict[str, Any]) -> Item | None:
    kind = node.get("__typename")
    if kind not in ("PullRequest", "Issue"):
        return None
    common: dict[str, Any] = {
        "repo": node["repository"]["nameWithOwner"],
        "number": node["number"],
        "title": node["title"],
        "url": node["url"],
        "author": _author(node),
        "labels": tuple(label["name"] for label in node.get("labels", {}).get("nodes", [])),
        "created_at": node["createdAt"],
        "updated_at": node["updatedAt"],
    }
    if kind == "Issue":
        merged = [
            source["url"]
            for event in node.get("timelineItems", {}).get("nodes", [])
            if (source := event.get("source") or {}).get("merged") and source.get("url")
        ]
        return Item(kind="issue", closed_by_merged_pr=merged[-1] if merged else None, **common)
    commits = node.get("commits", {}).get("nodes", [])
    commit = commits[-1]["commit"] if commits else {}
    rollup = commit.get("statusCheckRollup") or {}
    return Item(
        kind="pr",
        is_draft=bool(node.get("isDraft")),
        conflicting=node.get("mergeable") == "CONFLICTING",
        last_commit_at=commit.get("committedDate"),
        ci=CI_STATES.get(str(rollup.get("state")), "none"),
        **common,
    )


class GraphQLReader:
    """Reads GitHub's GraphQL API with a fine-grained token, read-only."""

    def __init__(self, token: str, *, client: httpx.AsyncClient | None = None) -> None:
        self._token = token
        self._client = client or httpx.AsyncClient(timeout=30)

    async def _post(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        response = await self._client.post(
            GRAPHQL_URL,
            json={"query": query, "variables": variables},
            headers={"Authorization": f"Bearer {self._token}"},
        )
        if response.status_code != 200:
            raise ReadFailure(f"GitHub a répondu {response.status_code}")
        payload: dict[str, Any] = response.json()
        if payload.get("errors"):
            first = payload["errors"][0].get("message", "erreur GraphQL")
            raise ReadFailure(f"GitHub a refusé la requête : {first}")
        return dict(payload.get("data") or {})

    async def _search(self, q: str, fields: str) -> tuple[list[Item], str | None]:
        items: list[Item] = []
        after: str | None = None
        count = 0
        while True:
            data = await self._post(SEARCH_QUERY % fields, {"q": q, "after": after})
            search = data["search"]
            count = int(search.get("issueCount", 0))
            items.extend(item for node in search["nodes"] if (item := _item(node)) is not None)
            page = search["pageInfo"]
            if not page.get("hasNextPage"):
                break
            after = page["endCursor"]
        if count > len(items) or count > SEARCH_CAP:
            return items, f"« {q} » : {len(items)} lus sur {count}, tri incomplet"
        return items, None

    async def stale(self, policy: TriagePolicy, now: datetime) -> Snapshot:
        pr_before = (now - timedelta(days=policy.pr_after_days)).date().isoformat()
        issue_before = (now - timedelta(days=policy.issue_after_days)).date().isoformat()
        snap = Snapshot()
        for account in policy.accounts:
            searches = (
                (f"is:open is:pr user:{account} created:<{pr_before}", PR_FIELDS),
                (f"is:open is:issue user:{account} updated:<{issue_before}", ISSUE_FIELDS),
            )
            for q, fields in searches:
                try:
                    items, gap = await self._search(q, fields)
                except (ReadFailure, httpx.HTTPError, KeyError, TypeError) as failure:
                    snap.incomplete.append(f"« {q} » illisible : {failure}")
                    continue
                snap.items.extend(item for item in items if not policy.excludes(item.repo))
                if gap:
                    snap.incomplete.append(gap)
        return snap

    async def current(self, repo: str, number: int) -> Current:
        owner, _, name = repo.partition("/")
        data = await self._post(STATE_QUERY, {"owner": owner, "name": name, "number": number})
        found = (data.get("repository") or {}).get("issueOrPullRequest") or {}
        if "updatedAt" not in found:
            raise ReadFailure(f"{repo}#{number} introuvable")
        return Current(open=found.get("state") == "OPEN", updated_at=found["updatedAt"])
