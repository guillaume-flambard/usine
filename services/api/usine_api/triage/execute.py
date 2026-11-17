"""Commenter, puis fermer, après la porte seulement (ADR 0003, points 3, 7, 8).

Une proposition du tri devient une `ProposedAction` dont l'aperçu porte tout ce
que la porte montre (dépôt, titre, motif, preuve, commentaire exact). Approuvée,
elle part en deux appels au serveur MCP de GitHub, par `McpExecutor`, qui garde
ses refus : un outil qui n'est pas marqué irréversible dans la liste blanche ne
passe pas.

Paramètres lus dans le README de `github/github-mcp-server` le 17 novembre 2026 :
`add_issue_comment(owner, repo, issue_number, body)` vaut pour une issue comme
pour une PR ; `issue_write(method="update", owner, repo, issue_number, state,
state_reason)` ; `update_pull_request(owner, repo, pullNumber, state)`. Un
doublon se ferme en `not_planned` : `state_reason="duplicate"` exigerait
`duplicate_of`, un numéro que l'agent n'a pas toujours.

Avant d'agir : le dépôt est revérifié contre la liste d'exclusion, l'élément
doit être encore ouvert et inchangé depuis le tri (un commit, une réponse ou un
« j'y travaille » arrivés pendant les 24 h de la porte annulent la proposition),
et le commentaire est neutralisé une seconde fois. Sans commentaire publié,
rien n'est fermé.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Protocol

from usine_api.contracts import ProposedAction

from .github import GitHubReader, TriagePolicy
from .judge import defuse
from .rules import Ruling

TARGET = "github/triage"


class ActionRunner(Protocol):
    async def execute(self, action: ProposedAction) -> str: ...


def to_action(ruling: Ruling) -> ProposedAction:
    item = ruling.item
    preview = {
        "repo": item.repo,
        "number": item.number,
        "kind": item.kind,
        "title": item.title,
        "url": item.url,
        "motif": ruling.motif,
        "proof": ruling.proof,
        "comment": ruling.comment,
        "state_reason": "completed" if ruling.motif == "resolu" else "not_planned",
        # What the triage saw: a newer update on GitHub cancels the proposal.
        "updated_at": item.updated_at.isoformat().replace("+00:00", "Z"),
    }
    return ProposedAction(
        kind="external_write",
        target=TARGET,
        justification=(
            f"{item.repo}#{item.number} « {item.title} » : {ruling.motif}, preuve {ruling.proof}"
        ),
        preview=json.dumps(preview, ensure_ascii=False),
    )


def _call(tool: str, arguments: dict[str, Any], why: str) -> ProposedAction:
    return ProposedAction(
        kind="external_write",
        target=f"github/{tool}",
        justification=why,
        preview=json.dumps(arguments, ensure_ascii=False),
    )


def _done(outcome: str) -> bool:
    return outcome.startswith("exécutée")


class TriageExecutor:
    """Runs one approved triage proposal: comment, then close."""

    def __init__(self, mcp: ActionRunner, reader: GitHubReader, policy: TriagePolicy) -> None:
        self._mcp = mcp
        self._reader = reader
        self._policy = policy

    async def execute(self, action: ProposedAction) -> str:
        try:
            data = json.loads(action.preview)
            repo, number, kind = str(data["repo"]), int(data["number"]), str(data["kind"])
            comment = defuse(str(data["comment"] or "").strip())
            seen = datetime.fromisoformat(str(data["updated_at"]))
        except (ValueError, KeyError, TypeError):
            return "refusée : la proposition approuvée est illisible"
        owner, _, name = repo.partition("/")
        if self._policy.excludes(repo) or not name:
            return "refusée : ce dépôt est exclu du tri"
        if not comment:
            return "refusée : aucun commentaire à publier"
        try:
            now = await self._reader.current(repo, number)
        except Exception as failure:  # noqa: BLE001 - one item never stops the others
            return f"état inconnu, rien envoyé : {failure}"
        if not now.open:
            return "déjà fermé : rien envoyé"
        if now.updated_at > seen:
            return "modifié depuis le tri : rien envoyé, à revoir demain"

        why = f"tri quotidien : {repo}#{number}"
        commented = await self._mcp.execute(
            _call(
                "add_issue_comment",
                {"owner": owner, "repo": name, "issue_number": number, "body": comment},
                why,
            )
        )
        if commented.startswith("état inconnu"):
            # The comment may have gone out: say so, and do not close on a guess.
            return f"état inconnu, non fermée : {commented}"
        if not _done(commented):
            return f"rien envoyé : {commented}"
        if kind == "pr":
            close = _call(
                "update_pull_request",
                {"owner": owner, "repo": name, "pullNumber": number, "state": "closed"},
                why,
            )
        else:
            close = _call(
                "issue_write",
                {
                    "method": "update",
                    "owner": owner,
                    "repo": name,
                    "issue_number": number,
                    "state": "closed",
                    "state_reason": str(data.get("state_reason") or "not_planned"),
                },
                why,
            )
        closed = await self._mcp.execute(close)
        return "commentée et fermée" if _done(closed) else f"commentée, non fermée : {closed}"
