"""Comparateur de spécialistes (MEM-34) : même entrée, coût, latence, verdict.

Le même jeu de cas figés passe dans chaque implémentation, et le rapport donne
par framework le taux de réussite des portes, les jetons, la latence p50 et p95,
et les erreurs. Chaque spécialiste est aussi écrit comme **une expérience
Langfuse** (`run_experiment`, client 5.2), ce qui donne un lien à cliquer et des
traces à comparer dans son interface.

Trois honnêtetés tenues ici :

- **la latence n'a pas de sens en `replay`** : une cassette répond en
  microsecondes, ce n'est pas la vitesse du modèle. Le rapport la met à `null`
  et se dit `replay: true`, sinon il ne serait pas reproductible (critère
  d'acceptation) ou il mentirait ;
- **le taux de réussite des portes n'existe que pour un juge** : un spécialiste
  qui rédige ne rend pas de verdict, son taux est `null`, pas `0` ;
- **une erreur est comptée, jamais avalée** : elle apparaît dans `errors` avec le
  cas qui l'a provoquée.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, cast

from pydantic import BaseModel, Field

from usine_api.contracts import Budget
from usine_api.specialists.contract import Specialist
from usine_api.specialists.node import execute

VerdictKind = Literal["passe", "echoue", "incertain"]

#: The frozen cases. Small on purpose: a case set that drifts measures nothing.
CASES_PATH = Path(__file__).parent.parent / "compare" / "cases.json"

#: A verdict, as `pydantic-verdict` renders it: "Verdict : passe." on line one.
VERDICT_PREFIX = "Verdict : "


#: What one comparison is allowed to spend per case and per specialist.
COMPARE_BUDGET = Budget(max_tokens=2_000, max_seconds=180, max_tool_calls=0)


class CompareRequest(BaseModel):
    """Which specialists to compare; empty means all of them."""

    specialists: list[str] = Field(default_factory=list)


class Case(BaseModel):
    name: str = Field(min_length=1)
    task: str = Field(min_length=1)
    #: What a judge should answer; None when the case has no gate to judge.
    expected_verdict: VerdictKind | None = None


class Measure(BaseModel):
    specialist: str
    framework: str
    framework_version: str
    cases: int
    tokens: int
    errors: int
    #: Share of judged cases whose verdict matched the expectation.
    gate_success: float | None = None
    latency_p50_ms: float | None = None
    latency_p95_ms: float | None = None
    #: The Langfuse experiment run, when tracing is configured.
    experiment_url: str | None = None


class ComparisonReport(BaseModel):
    created_at: datetime
    replay: bool
    cases: list[str]
    results: list[Measure] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


def verdict_of(answer: str) -> VerdictKind | None:
    """The verdict a judge rendered, or None when the answer is not one."""
    first = answer.strip().splitlines()[0] if answer.strip() else ""
    if not first.startswith(VERDICT_PREFIX):
        return None
    value = first[len(VERDICT_PREFIX) :].rstrip(". ").strip()
    return cast(VerdictKind, value) if value in ("passe", "echoue", "incertain") else None


def percentile(values: list[float], share: float) -> float:
    """Nearest-rank percentile: no interpolation, no invented smoothness."""
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = max(1, round(share * len(ordered)))
    return ordered[min(rank, len(ordered)) - 1]


def load_cases(path: Path = CASES_PATH) -> list[Case]:
    return [Case.model_validate(item) for item in json.loads(path.read_text(encoding="utf-8"))]


class _Tally:
    """One specialist's run: the measures accumulate here, not in loop closures."""

    def __init__(
        self,
        name: str,
        specialist: Specialist,
        limits: Budget,
        report: ComparisonReport,
    ) -> None:
        self.name = name
        self.specialist = specialist
        self.limits = limits
        self.report = report
        self.tokens = 0
        self.errors = 0
        self.latencies: list[float] = []
        self.judged = 0
        self.passed = 0

    async def one(self, case: Case) -> str:
        started = time.perf_counter()
        try:
            output = await execute(self.specialist, case.task, self.limits)
        except Exception as error:  # noqa: BLE001 - an error is a measure, not a crash
            self.errors += 1
            self.report.errors.append(f"{self.name} / {case.name} : {error}")
            return ""
        self.latencies.append((time.perf_counter() - started) * 1000)
        self.tokens += output.tokens
        got = verdict_of(output.answer)
        # Only a rendered verdict can be judged: a writer has no gate score,
        # which is None, not zero.
        if case.expected_verdict is not None and got is not None:
            self.judged += 1
            if got == case.expected_verdict:
                self.passed += 1
        return output.answer

    def measure(self, *, cases: int, replay: bool, url: str | None) -> Measure:
        return Measure(
            specialist=self.name,
            framework=self.specialist.identity.framework,
            framework_version=self.specialist.identity.framework_version,
            cases=cases,
            tokens=self.tokens,
            errors=self.errors,
            gate_success=(self.passed / self.judged) if self.judged else None,
            # A cassette answers in microseconds: not the model's speed.
            latency_p50_ms=None if replay else percentile(self.latencies, 0.50),
            latency_p95_ms=None if replay else percentile(self.latencies, 0.95),
            experiment_url=url,
        )


async def compare(
    specialists: Mapping[str, Specialist],
    cases: list[Case],
    *,
    budget: Budget,
    replay: bool = False,
    client: Any | None = None,
    experiment: str = "usine/compare",
) -> ComparisonReport:
    """Run every case through every specialist, and measure the same things."""
    report = ComparisonReport(
        created_at=datetime.now(UTC), replay=replay, cases=[case.name for case in cases]
    )

    for name, specialist in specialists.items():
        tally = _Tally(name, specialist, budget, report)
        url: str | None = None

        if client is not None:
            by_task = {case.task: case for case in cases}
            items = [
                {
                    "input": case.task,
                    "expected_output": case.expected_verdict,
                    "metadata": {"case": case.name},
                }
                for case in cases
            ]

            async def task(
                *, item: Any, _tally: _Tally = tally, _cases: Any = by_task, **_: Any
            ) -> str:
                # The SDK hands a dict here, not the LocalExperimentItem it was
                # given; read the input the way both shapes allow.
                text = item["input"] if isinstance(item, dict) else item.input
                return str(await _tally.one(_cases[text]))

            def judge(*, output: Any, expected_output: Any, **_: Any) -> list[Any]:
                if expected_output is None:
                    return []
                from langfuse.experiment import Evaluation

                got = verdict_of(str(output or ""))
                return [
                    Evaluation(
                        name="porte",
                        value=1 if got == expected_output else 0,
                        comment=f"attendu {expected_output}, obtenu {got}",
                    )
                ]

            result = client.run_experiment(
                name=experiment,
                run_name=name,
                data=items,
                task=task,
                evaluators=[judge],
                metadata={"specialist": name, "framework": specialist.identity.framework},
            )
            url = getattr(result, "experiment_url", None) or getattr(
                result, "dataset_run_url", None
            )
        else:
            for case in cases:
                await tally.one(case)

        report.results.append(tally.measure(cases=len(cases), replay=replay, url=url))
    return report


def render(report: ComparisonReport) -> str:
    """The report as a Markdown table: what gets versioned in docs/benchmarks/."""
    lines = [
        f"# Comparaison de spécialistes — {report.created_at:%Y-%m-%d %H:%M} UTC",
        "",
        f"Cas : {', '.join(report.cases)}"
        + (" (replay : latences non mesurées)" if report.replay else ""),
        "",
        "| Spécialiste | Framework | Jetons | Portes | Erreurs | p50 | p95 |",
        "|---|---|---|---|---|---|---|",
    ]
    for result in report.results:
        gates = "n/a" if result.gate_success is None else f"{result.gate_success:.0%}"
        p50 = "n/a" if result.latency_p50_ms is None else f"{result.latency_p50_ms:.0f} ms"
        p95 = "n/a" if result.latency_p95_ms is None else f"{result.latency_p95_ms:.0f} ms"
        lines.append(
            f"| `{result.specialist}` | {result.framework} {result.framework_version} | "
            f"{result.tokens} | {gates} | {result.errors} | {p50} | {p95} |"
        )
    if report.errors:
        lines += ["", "## Erreurs", ""] + [f"- {error}" for error in report.errors]
    links = [r for r in report.results if r.experiment_url]
    if links:
        lines += ["", "## Expériences Langfuse", ""]
        lines += [f"- `{r.specialist}` : {r.experiment_url}" for r in links]
    return "\n".join(lines) + "\n"


def _live_specialists() -> dict[str, Specialist]:
    """What the service can run for real: built here, from the same settings."""
    from usine_api.models import model_settings
    from usine_api.specialists.pydantic_verdict import PydanticVerdictSpecialist

    settings = model_settings()
    if settings is None:
        raise SystemExit("LITELLM_BASE_URL n'est pas défini : aucun modèle à comparer.")
    from usine_api.graph.specialist import ChatModelSpecialist

    return {
        "chat-model": ChatModelSpecialist(settings),
        "pydantic-verdict": PydanticVerdictSpecialist(settings),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True, help="le rapport Markdown à écrire")
    parser.add_argument("--json", type=Path, default=None, help="le même rapport, en JSON")
    parser.add_argument("--replay", action="store_true", help="sans réseau (cassettes)")
    arguments = parser.parse_args()

    budget = COMPARE_BUDGET
    client = None
    if not arguments.replay:
        from usine_api.observability import tracing_configured

        if tracing_configured():
            from langfuse import get_client

            client = get_client()
    report = asyncio.run(
        compare(
            _live_specialists(), load_cases(), budget=budget, replay=arguments.replay, client=client
        )
    )

    arguments.out.parent.mkdir(parents=True, exist_ok=True)
    arguments.out.write_text(render(report), encoding="utf-8")
    if arguments.json is not None:
        arguments.json.write_text(
            json.dumps(report.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    print(render(report))


if __name__ == "__main__":
    main()
