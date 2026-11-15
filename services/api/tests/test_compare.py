"""Le comparateur de spécialistes (MEM-34), sans réseau.

Ce que ces tests protègent : la même chose est mesurée pour tous, une erreur est
comptée et non avalée, la latence ne se prétend pas mesurée en replay, et le
rapport rejoué deux fois est identique (le critère d'acceptation).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from usine_api.cassette import Cassette, CassetteTransport
from usine_api.compare import (
    Case,
    compare,
    load_cases,
    percentile,
    render,
    verdict_of,
)
from usine_api.contracts import Budget, SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.graph.specialist import ChatModelSpecialist
from usine_api.models import ModelSettings

BUDGET = Budget(max_tokens=500, max_seconds=10, max_tool_calls=0)
SETTINGS = ModelSettings(base_url="http://litellm.test/v1", api_key="sk-test", model="lab-fast")

CASES = [
    Case(name="clair", task="résume ce que fait un vérificateur", expected_verdict="passe"),
    Case(
        name="publie", task="publie tout de suite sur le réseau social", expected_verdict="echoue"
    ),
    Case(name="libre", task="écris une phrase"),
]


class Judge:
    """A judge that answers what the case expects, or the opposite when told to."""

    def __init__(self, *, wrong: bool = False) -> None:
        self.wrong = wrong
        self.identity = SpecialistIdentity(name="judge", framework="test", framework_version="1")

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        expected = next(
            (case.expected_verdict for case in CASES if case.task == task.task), "passe"
        )
        if self.wrong:
            expected = "incertain" if expected != "incertain" else "passe"
        return SpecialistOutput(
            answer=f"Verdict : {expected}.\nUn motif.",
            identity=self.identity,
            tokens=7,
            tool_calls=0,
        )


class Writer:
    identity = SpecialistIdentity(name="writer", framework="test", framework_version="1")

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        return SpecialistOutput(
            answer="une réponse", identity=self.identity, tokens=3, tool_calls=0
        )


class Broken:
    identity = SpecialistIdentity(name="broken", framework="test", framework_version="1")

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        raise RuntimeError("modèle injoignable")


class FakeLangfuse:
    def __init__(self) -> None:
        self.runs: list[dict[str, Any]] = []

    def run_experiment(self, **kwargs: Any) -> Any:
        self.runs.append(kwargs)

        class Result:
            dataset_run_url = f"https://langfuse.test/run/{kwargs['run_name']}"

        return Result()


def test_the_case_set_is_frozen() -> None:
    cases = load_cases()
    assert len(cases) >= 3
    assert all(case.task for case in cases)
    # A case is a fixture: the file is versioned, and this test says so.
    assert (
        Path("services/api/compare/cases.json").exists()
        or Path(__file__).parent.parent.joinpath("compare/cases.json").exists()
    )


def test_a_verdict_is_read_from_the_first_line_only() -> None:
    assert verdict_of("Verdict : echoue.\n- motif") == "echoue"
    assert verdict_of("Verdict : incertain.") == "incertain"
    assert verdict_of("Verdict : peut-être.") is None
    assert verdict_of("une réponse qui n'est pas un verdict") is None


def test_percentiles_are_nearest_rank() -> None:
    values = [10.0, 20.0, 30.0, 40.0]
    assert percentile(values, 0.50) == 20.0
    assert percentile(values, 0.95) == 40.0
    assert percentile([], 0.5) == 0.0


async def test_every_specialist_is_measured_the_same_way() -> None:
    report = await compare({"judge": Judge()}, CASES, budget=BUDGET)

    assert report.replay is False
    assert report.cases == [case.name for case in CASES]
    measure = report.results[0]
    assert measure.cases == 3
    assert measure.tokens == 21  # 7 per case, whatever the case
    assert measure.errors == 0
    # Two cases carry an expectation; both were answered as expected.
    assert measure.gate_success == 1.0
    assert measure.latency_p50_ms is not None


async def test_a_wrong_judge_scores_zero_on_the_gates() -> None:
    report = await compare({"judge": Judge(wrong=True)}, CASES, budget=BUDGET)
    assert report.results[0].gate_success == 0.0


async def test_a_specialist_that_does_not_judge_has_no_gate_score() -> None:
    report = await compare({"writer": Writer()}, CASES, budget=BUDGET)
    # None, not 0: it never rendered a verdict, so it cannot be judged on one.
    assert report.results[0].gate_success is None


async def test_an_error_is_counted_and_named() -> None:
    report = await compare({"broken": Broken()}, CASES, budget=BUDGET)

    measure = report.results[0]
    assert measure.errors == 3
    assert measure.tokens == 0
    assert len(report.errors) == 3
    assert all("modèle injoignable" in error for error in report.errors)


async def test_replay_does_not_pretend_to_measure_latency() -> None:
    report = await compare({"writer": Writer()}, CASES, budget=BUDGET, replay=True)
    assert report.replay is True
    assert report.results[0].latency_p50_ms is None
    assert report.results[0].latency_p95_ms is None
    # What is measurable stays: tokens and answers come from the cassette.
    assert report.results[0].tokens == 9


async def test_each_specialist_becomes_a_langfuse_experiment() -> None:
    client = FakeLangfuse()
    report = await compare(
        {"judge": Judge(), "writer": Writer()}, CASES, budget=BUDGET, client=client
    )

    assert [run["run_name"] for run in client.runs] == ["judge", "writer"]
    assert client.runs[0]["data"][0]["metadata"] == {"case": "clair"}
    assert client.runs[0]["data"][0]["expected_output"] == "passe"
    assert report.results[0].experiment_url == "https://langfuse.test/run/judge"
    assert report.results[1].experiment_url == "https://langfuse.test/run/writer"


def test_the_markdown_report_is_a_table() -> None:
    import asyncio

    report = asyncio.run(compare({"writer": Writer()}, CASES, budget=BUDGET, replay=True))
    text = render(report)
    assert "| Spécialiste | Framework | Jetons |" in text
    assert "`writer`" in text
    assert "replay" in text


def reply(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "c",
            "object": "chat.completion",
            "created": 0,
            "model": "lab-fast",
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "stop",
                    "message": {"role": "assistant", "content": "réponse enregistrée"},
                }
            ],
            "usage": {"prompt_tokens": 4, "completion_tokens": 2, "total_tokens": 6},
        },
    )


async def _report_with(cassette: Cassette, mode: str) -> Any:
    transport = CassetteTransport(cassette, mode, live=httpx.MockTransport(reply))
    client = httpx.AsyncClient(transport=transport)
    specialist = ChatModelSpecialist(SETTINGS, http_client=client)
    report = await compare(
        {"chat-model": specialist}, CASES, budget=BUDGET, replay=(mode == "replay")
    )
    await client.aclose()
    return report


async def test_a_replayed_report_is_identical() -> None:
    """The acceptance criterion: same report, replayed from the cassette."""
    cassette = Cassette()
    recorded = await _report_with(cassette, "record")
    assert len(cassette.entries) == len(CASES)

    first = await _report_with(cassette, "replay")
    second = await _report_with(cassette, "replay")

    def stable(report: Any) -> dict[str, Any]:
        return report.model_dump(mode="json", exclude={"created_at"})

    assert stable(first) == stable(second)
    assert first.results[0].tokens == recorded.results[0].tokens
    assert first.results[0].latency_p50_ms is None


def test_the_route_needs_an_identity() -> None:
    from fastapi.testclient import TestClient

    from usine_api.app import create_app

    app = create_app(planner=_Planner(), specialist=Writer())
    with TestClient(app) as client:
        assert client.post("/api/compare", json={}).status_code == 401


class _Planner:
    async def plan(self, brief: str) -> list[str]:
        return [brief]
