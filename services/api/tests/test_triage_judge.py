"""The agents' verdict: structured, validated, and cautious (ADR 0003, point 5)."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from langchain_core.tools import StructuredTool

from usine_api.mcp_registry import Registry
from usine_api.mcp_tools import Toolbox
from usine_api.models import ModelSettings
from usine_api.triage.github import Item
from usine_api.triage.judge import LangChainJudge, RepoVerdicts, TriageVerdict, settle

NOW = datetime(2026, 11, 17, 8, 0, tzinfo=UTC)
ITEM = Item(
    repo="memolabs-dev/usine",
    number=33,
    kind="issue",
    title="Ancienne idée",
    url="https://github.com/memolabs-dev/usine/issues/33",
    author="guillaume-flambard",
    created_at=NOW,
    updated_at=NOW,
)
PROOF = "https://github.com/memolabs-dev/usine/issues/12"
CLOSE_WITH_PROOF = TriageVerdict(
    number=33, decision="fermer", motif="doublon", proof=PROOF, comment="Doublon de #12."
)
SETTINGS = ModelSettings(base_url="http://gateway.test", api_key="k", model="m")
REGISTRY = Registry.load(Path(__file__).parents[3] / "config" / "mcp-servers.yaml")
FAKE_TRANSPORT: Any = object()


def test_verdict_without_proof_becomes_keep() -> None:
    v = TriageVerdict(number=33, decision="fermer", motif="abandonne", comment="x")
    assert settle(ITEM, v).group == "a_garder"


def test_verdict_with_non_github_proof_becomes_keep() -> None:
    v = CLOSE_WITH_PROOF.model_copy(update={"proof": "https://exemple.test/1"})
    assert settle(ITEM, v).group == "a_garder"


def test_verdict_without_comment_or_motif_becomes_keep() -> None:
    assert settle(ITEM, CLOSE_WITH_PROOF.model_copy(update={"comment": "  "})).group == "a_garder"
    assert settle(ITEM, CLOSE_WITH_PROOF.model_copy(update={"motif": None})).group == "a_garder"


def test_missing_verdict_becomes_keep() -> None:
    assert settle(ITEM, None).group == "a_garder"


def test_nudge_is_kept_not_proposed() -> None:
    v = TriageVerdict(number=33, decision="relancer", comment="Toujours utile ?")
    r = settle(ITEM, v)
    assert r.group == "a_garder" and r.comment == "Toujours utile ?"


def test_close_with_proof_is_proposed() -> None:
    r = settle(ITEM, CLOSE_WITH_PROOF)
    assert (r.group, r.by, r.motif, r.proof) == ("evident", "agent", "doublon", PROOF)
    assert r.comment == "Doublon de #12."


def test_mentions_are_defused() -> None:
    v = CLOSE_WITH_PROOF.model_copy(update={"comment": "Voir avec @alice, mail a@b.c"})
    assert settle(ITEM, v).comment == "Voir avec @\u2060alice, mail a@b.c"


def test_mentions_inside_code_spans_are_defused_too() -> None:
    # Backticks around the mention failed inside an existing code span (review).
    v = CLOSE_WITH_PROOF.model_copy(update={"comment": "voir `cc @bob` ici"})
    assert settle(ITEM, v).comment == "voir `cc @\u2060bob` ici"


def test_a_long_comment_is_kept_not_proposed() -> None:
    v = CLOSE_WITH_PROOF.model_copy(update={"comment": "x" * 501})
    assert settle(ITEM, v).group == "a_garder"


def tool(name: str) -> StructuredTool:
    async def run() -> str:
        return ""

    return StructuredTool.from_function(coroutine=run, name=name, description=name)


class FakeAgent:
    def __init__(self, answer: RepoVerdicts | None) -> None:
        self.answer = answer
        self.messages: list[Any] = []

    async def ainvoke(self, state: dict[str, Any]) -> dict[str, Any]:
        self.messages = state["messages"]
        return {"messages": [], "structured_response": self.answer}


class OfflineJudge(LangChainJudge):
    async def _toolbox(self, transport: Any) -> Toolbox:
        names = ("github__issue_read", "github__get_file_contents", "github__issue_write")
        return Toolbox(tools=[tool(name) for name in names])


async def test_judge_gets_read_tools_only() -> None:
    seen: dict[str, Any] = {}
    agent = FakeAgent(RepoVerdicts(verdicts=[CLOSE_WITH_PROOF]))

    def capture(model: Any, tools: list[Any], **options: Any) -> FakeAgent:
        seen.update(tools=tools, **options)
        return agent

    judge = OfflineJudge(
        SETTINGS, registry=REGISTRY, transports=lambda owner: FAKE_TRANSPORT, agent_factory=capture
    )
    verdicts = await judge.judge("memolabs-dev/usine", [ITEM])
    assert {t.name for t in seen["tools"]} == {"github__issue_read", "github__get_file_contents"}
    assert seen["response_format"] is RepoVerdicts
    assert verdicts.verdicts == [CLOSE_WITH_PROOF]
    # The facts reach the agent: number, link, author.
    brief = agent.messages[0].content
    assert "#33" in brief and ITEM.url in brief and "guillaume-flambard" in brief


async def test_judge_without_structured_answer_returns_no_verdict() -> None:
    judge = OfflineJudge(
        SETTINGS,
        registry=REGISTRY,
        transports=lambda owner: FAKE_TRANSPORT,
        agent_factory=lambda *a, **k: FakeAgent(None),
    )
    assert (await judge.judge("memolabs-dev/usine", [ITEM])).verdicts == []
