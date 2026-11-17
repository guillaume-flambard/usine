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

#: `@login` not already inside backticks, and not the middle of an email address.
MENTION = re.compile(r"(?<![`\w])@([A-Za-z0-9][\w-]*)")

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
    """`@login` would notify someone: the comment shows it as code instead."""
    return MENTION.sub(r"`@\1`", comment)


def settle(item: Item, verdict: TriageVerdict | None) -> Ruling:
    """The agent's verdict, after the caution rule: no proof, no close."""
    if verdict is None:
        return Ruling(item=item, group="a_garder", by="agent")
    comment = defuse(verdict.comment.strip())
    proven = bool(verdict.proof and verdict.proof.startswith(PROOF_PREFIX))
    if verdict.decision == "fermer" and proven and verdict.motif and comment:
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
        transport: Transport,
        http_client: httpx.AsyncClient | None = None,
        agent_factory: Callable[..., Any] = create_agent,
    ) -> None:
        self._settings = settings
        self._registry = registry
        self._transport = transport
        self._client = http_client
        self._agent_factory = agent_factory

    async def _toolbox(self) -> Toolbox:
        return await toolbox(self._registry, transport=self._transport)

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
        box = await self._toolbox()
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
