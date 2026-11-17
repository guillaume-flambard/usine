"""Le pré-tri par règles, sans modèle (ADR 0003, point 4).

Une règle ne tranche que là où un fait GitHub suffit : une PR Dependabot
remplacée par une plus récente du même paquet, ou une issue citée par une PR
fusionnée. Tout le reste qui traîne va aux agents. Une issue P0 ou P1 n'est
jamais fermée par une règle, même citée par une PR fusionnée : une personne, ou
au moins un agent avec sa preuve, doit la regarder.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict

from .github import Item, TriagePolicy

Group = Literal["evident", "a_juger", "a_garder"]
Motif = Literal["resolu", "doublon", "depasse", "abandonne"]

#: `chore(deps): bump vite from 6.0.1 to 6.0.2 in /apps/web`, any casing.
BUMP = re.compile(r"\bbump (\S+) from \S+ to \S+(?: in (\S+))?", re.IGNORECASE)

#: Never closed by a rule.
URGENT_LABELS = frozenset({"p0", "p1"})

SUPERSEDED = "Fermée par le tri quotidien de l'usine : remplacée par {proof}."
RESOLVED = "Fermée par le tri quotidien de l'usine : résolue par {proof}."


class Ruling(BaseModel):
    """Where an item lands. In `evident`, a proposal to close; `by` says whose."""

    model_config = ConfigDict(frozen=True)

    item: Item
    group: Group
    by: Literal["rule", "agent"] = "rule"
    motif: Motif | None = None
    proof: str | None = None
    comment: str | None = None


def _package(item: Item) -> tuple[str, str, str] | None:
    """`(repo, package, directory)` for a Dependabot bump, else None."""
    if item.kind != "pr" or item.author != "dependabot":
        return None
    found = BUMP.search(item.title)
    if found is None:
        return None
    return item.repo, found.group(1).lower(), (found.group(2) or "/").lower()


def _stale(item: Item, policy: TriagePolicy, now: datetime) -> bool:
    if item.kind == "issue":
        return item.updated_at < now - timedelta(days=policy.issue_after_days)
    if item.created_at >= now - timedelta(days=policy.pr_after_days):
        return False
    # A draft still being committed to is work in progress, not a leftover.
    if item.is_draft and item.last_commit_at is not None:
        return item.last_commit_at < now - timedelta(days=policy.draft_after_days)
    return True


def pretriage(items: list[Item], policy: TriagePolicy, now: datetime) -> list[Ruling]:
    kept = [item for item in items if not policy.excludes(item.repo)]

    newest: dict[tuple[str, str, str], Item] = {}
    for item in kept:
        key = _package(item)
        if key is not None and (key not in newest or item.created_at > newest[key].created_at):
            newest[key] = item

    rulings: list[Ruling] = []
    for item in kept:
        urgent = any(label.lower() in URGENT_LABELS for label in item.labels)
        key = _package(item)
        replacement = newest.get(key) if key is not None else None
        if replacement is not None and replacement is not item and not urgent:
            rulings.append(
                Ruling(
                    item=item,
                    group="evident",
                    motif="depasse",
                    proof=replacement.url,
                    comment=SUPERSEDED.format(proof=replacement.url),
                )
            )
        elif item.closed_by_merged_pr and not urgent:
            rulings.append(
                Ruling(
                    item=item,
                    group="evident",
                    motif="resolu",
                    proof=item.closed_by_merged_pr,
                    comment=RESOLVED.format(proof=item.closed_by_merged_pr),
                )
            )
        elif _stale(item, policy, now):
            rulings.append(Ruling(item=item, group="a_juger"))
        else:
            rulings.append(Ruling(item=item, group="a_garder"))
    return rulings
