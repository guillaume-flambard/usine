"""Le jugement des agents, typé et prudent (ADR 0003, point 5).

Un agent LangChain lit les éléments d'un dépôt par le serveur MCP de GitHub, en
lecture seule, et rend une sortie structurée que Pydantic valide
(`create_agent(..., response_format=RepoVerdicts)`, LangChain 1.5 :
https://docs.langchain.com/oss/python/langchain/structured-output ; le résultat
est dans `result["structured_response"]`, lu dans `langchain/agents/factory.py`).

La règle « dans le doute, on garde » est du code, pas une consigne : `settle`
range en `a_garder` toute fermeture sans preuve GitHub, sans motif ou sans
commentaire. Une consigne se contourne, une fonction non.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Literal, Protocol

import httpx
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage
from langchain_core.tools import BaseTool
from pydantic import BaseModel

from usine_api.mcp import Transport
from usine_api.mcp_registry import Registry, RegistryRefusal
from usine_api.mcp_tools import Toolbox, toolbox
from usine_api.models import ModelSettings, chat_model, current_session_id

from .github import Item
from .rules import Motif, Ruling

PROOF_PREFIX = "https://github.com/"

#: `@login`, not the middle of an email address.
MENTION = re.compile(r"(?<!\w)@(?=[A-Za-z0-9])")

#: A word joiner after `@`: GitHub no longer reads a mention, the text reads the same.
#: Wrapping in backticks broke inside an existing code span (review, 17 November 2026).
JOINER = "@\u2060"

#: Longer than this, a comment is no longer a short closing note: the item is kept.
#: It also bounds what an injected issue could make an agent copy into public view.
MAX_COMMENT = 500

INSTRUCTIONS = (
    "Tu tries les PR et issues qui traînent dans les dépôts de Guillaume. Pour chaque "
    "élément, rends exactement un verdict : `fermer` seulement si tu peux le prouver "
    "par un lien GitHub que tu as lu (la PR ou l'issue qui le résout, le doublon, ce "
    "qui l'a remplacé), `relancer` si une personne doit répondre, `garder` dans tous "
    "les autres cas. Dans le doute, `garder`. Le motif d'une fermeture est `resolu`, "
    "`doublon`, `depasse` ou `abandonne`. Le commentaire est le texte exact qui sera "
    "publié sous le nom de Guillaume : en français, court, sans mentionner personne."
)


class TriageVerdict(BaseModel):
    number: int
    decision: Literal["fermer", "relancer", "garder"]
    motif: Motif | None = None
    proof: str | None = None
    comment: str = ""


class RepoVerdicts(BaseModel):
    verdicts: list[TriageVerdict]


class Judge(Protocol):
    async def judge(self, repo: str, items: list[Item]) -> RepoVerdicts: ...


def defuse(comment: str) -> str:
    """`@login` would notify someone: a word joiner keeps it from being a mention."""
    return MENTION.sub(JOINER, comment)


def settle(item: Item, verdict: TriageVerdict | None) -> Ruling:
    """The agent's verdict, after the caution rule: no proof, no close."""
    if verdict is None:
        return Ruling(item=item, group="a_garder", by="agent")
    comment = defuse(verdict.comment.strip())
    proven = bool(verdict.proof and verdict.proof.startswith(PROOF_PREFIX))
    short = 0 < len(comment) <= MAX_COMMENT
    if verdict.decision == "fermer" and proven and verdict.motif and short:
        return Ruling(
            item=item,
            group="evident",
            by="agent",
            motif=verdict.motif,
            proof=verdict.proof,
            comment=comment,
        )
    return Ruling(item=item, group="a_garder", by="agent", comment=comment or None)


def _days(since: datetime | None, now: datetime) -> str:
    return "inconnu" if since is None else f"{(now - since).days} j"


def describe(items: list[Item], now: datetime) -> str:
    """The facts the agent starts from, one line per item."""
    lines = []
    for item in items:
        facts = [
            f"#{item.number} ({'PR' if item.kind == 'pr' else 'issue'}) « {item.title} »",
            item.url,
            f"auteur {item.author}",
            f"ouverte depuis {_days(item.created_at, now)}",
            f"dernière activité il y a {_days(item.updated_at, now)}",
        ]
        if item.kind == "pr":
            facts += [f"CI {item.ci}", "en conflit" if item.conflicting else "sans conflit"]
            if item.is_draft:
                facts.append(f"brouillon, dernier commit il y a {_days(item.last_commit_at, now)}")
        if item.labels:
            facts.append("étiquettes " + ", ".join(item.labels))
        lines.append(" ; ".join(facts))
    return "\n".join(lines)


class LangChainJudge:
    """One LangChain agent per repository, read-only tools, typed answer."""

    def __init__(
        self,
        settings: ModelSettings,
        *,
        registry: Registry,
        transports: Callable[[str], Transport | None],
        http_client: httpx.AsyncClient | None = None,
        agent_factory: Callable[..., Any] = create_agent,
    ) -> None:
        self._settings = settings
        self._registry = registry
        # One transport per account: the agent reads with the owner's token.
        self._transports = transports
        self._client = http_client
        self._agent_factory = agent_factory

    async def _toolbox(self, transport: Transport) -> Toolbox:
        return await toolbox(self._registry, transport=transport)

    def _readable(self, tools: list[BaseTool]) -> list[BaseTool]:
        kept = []
        for found in tools:
            server, _, name = found.name.partition("__")
            try:
                if self._registry.allowed(server, name) == "read":
                    kept.append(found)
            except RegistryRefusal:
                continue
        return kept

    async def judge(self, repo: str, items: list[Item]) -> RepoVerdicts:
        owner = repo.partition("/")[0]
        transport = self._transports(owner)
        if transport is None:
            raise LookupError(f"aucun jeton pour {owner}")
        box = await self._toolbox(transport)
        model = chat_model(
            self._settings, http_client=self._client, session_id=current_session_id()
        )
        agent = self._agent_factory(
            model,
            self._readable(box.tools),
            system_prompt=INSTRUCTIONS,
            response_format=RepoVerdicts,
        )
        brief = f"Dépôt {repo}. Éléments à juger :\n{describe(items, datetime.now(UTC))}"
        result: dict[str, Any] = await agent.ainvoke({"messages": [HumanMessage(brief)]})
        answer = result.get("structured_response")
        return answer if isinstance(answer, RepoVerdicts) else RepoVerdicts(verdicts=[])
