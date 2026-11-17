"""The rule-based pre-triage: no model, only GitHub's facts (ADR 0003, point 4)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from usine_api.triage.github import Item, TriagePolicy
from usine_api.triage.rules import Ruling, pretriage

NOW = datetime(2026, 11, 17, 8, 0, tzinfo=UTC)
POLICY = TriagePolicy(
    accounts=["guillaume-flambard", "memolabs-dev"],
    excluded_repos=["mediterranean-rescue", "sosmed-carto-recette"],
    excluded_owners=["dataforgoodfr"],
)
MERGED = "https://github.com/guillaume-flambard/lab-infra/pull/52"


def D(days: int) -> datetime:
    return NOW + timedelta(days=days)


def pr(repo: str, number: int, title: str, **facts: Any) -> Item:
    created = facts.pop("created", D(-5))
    return Item(
        repo=repo,
        number=number,
        kind="pr",
        title=title,
        url=f"https://github.com/{repo}/pull/{number}",
        author=facts.pop("author", "guillaume-flambard"),
        created_at=created,
        updated_at=facts.pop("updated", created),
        **facts,
    )


def issue(number: int, repo: str = "guillaume-flambard/lab-infra", **facts: Any) -> Item:
    return Item(
        repo=repo,
        number=number,
        kind="issue",
        title=f"Issue {number}",
        url=f"https://github.com/{repo}/issues/{number}",
        author="guillaume-flambard",
        created_at=facts.pop("created", D(-40)),
        updated_at=facts.pop("updated", D(-20)),
        **facts,
    )


def by_number(rulings: list[Ruling]) -> dict[int, Ruling]:
    return {r.item.number: r for r in rulings}


def test_superseded_dependabot_pr_is_evident() -> None:
    old = pr(
        "memolabs-dev/usine",
        10,
        "chore(deps): bump vite from 6.0.1 to 6.0.2",
        author="dependabot",
        created=D(-9),
    )
    new = pr(
        "memolabs-dev/usine",
        14,
        "chore(deps): bump vite from 6.0.1 to 6.1.0",
        author="dependabot",
        created=D(-3),
    )
    r = by_number(pretriage([old, new], POLICY, NOW))
    assert r[10].group == "evident" and r[10].motif == "depasse" and r[10].proof == new.url
    assert r[10].by == "rule"
    assert r[14].group == "a_juger"


def test_bumps_in_different_directories_are_different_packages() -> None:
    web = pr(
        "memolabs-dev/navirox",
        77,
        "chore(deps): bump addressable from 2.9.0 to 2.9.1 in /examples/vue-basic",
        author="dependabot",
        created=D(-5),
    )
    pilot = pr(
        "memolabs-dev/navirox",
        78,
        "chore(deps): bump addressable from 2.9.0 to 2.9.1 in /examples/vue-pilot",
        author="dependabot",
        created=D(-4),
    )
    r = by_number(pretriage([web, pilot], POLICY, NOW))
    assert r[77].group == "a_juger" and r[78].group == "a_juger"


def test_a_human_bump_is_not_superseded_by_a_rule() -> None:
    mine = pr("memolabs-dev/usine", 10, "Bump vite from 6.0.1 to 6.0.2", created=D(-9))
    bot = pr(
        "memolabs-dev/usine",
        14,
        "Bump vite from 6.0.1 to 6.1.0",
        author="dependabot",
        created=D(-3),
    )
    assert by_number(pretriage([mine, bot], POLICY, NOW))[10].group == "a_juger"


def test_issue_cited_by_merged_pr_is_evident() -> None:
    r = pretriage([issue(7, closed_by_merged_pr=MERGED)], POLICY, NOW)[0]
    assert (r.group, r.motif, r.proof) == ("evident", "resolu", MERGED)


def test_p0_and_p1_never_evident() -> None:
    for label in ("P0", "P1", "p1"):
        r = pretriage([issue(7, labels=(label,), closed_by_merged_pr=MERGED)], POLICY, NOW)[0]
        assert r.group == "a_juger"


def test_old_draft_without_commit_goes_to_agents() -> None:
    draft = pr("memolabs-dev/cra-clock", 3, "wip", is_draft=True, last_commit_at=D(-20))
    assert pretriage([draft], POLICY, NOW)[0].group == "a_juger"


def test_draft_still_committed_to_is_kept() -> None:
    draft = pr("memolabs-dev/cra-clock", 3, "wip", is_draft=True, last_commit_at=D(-2))
    assert pretriage([draft], POLICY, NOW)[0].group == "a_garder"


def test_fresh_items_are_kept() -> None:
    young = pr("memolabs-dev/usine", 5, "feat: x", created=D(-1))
    active = issue(9, updated=D(-2))
    r = by_number(pretriage([young, active], POLICY, NOW))
    assert r[5].group == "a_garder" and r[9].group == "a_garder"


def test_excluded_repo_is_dropped_even_if_reader_let_it_through() -> None:
    assert pretriage([issue(1, repo="dataforgoodfr/x")], POLICY, NOW) == []
    assert pretriage([issue(1, repo="memolabs-dev/mediterranean-rescue")], POLICY, NOW) == []


def test_evident_comment_names_the_proof() -> None:
    r = pretriage([issue(7, closed_by_merged_pr=MERGED)], POLICY, NOW)[0]
    assert r.comment == f"Fermée par le tri quotidien de l'usine : résolue par {MERGED}."


def test_a_mention_by_a_merged_pr_goes_to_agents() -> None:
    r = pretriage([issue(8, mentioned_by_merged_pr=MERGED)], POLICY, NOW)[0]
    assert r.group == "a_juger"
