"""Le rapport de comparaison, sans dépendance de framework (MEM-34).

Ce module ne connaît que Pydantic : c'est ce qui permet à un framework de vivre
dans son propre environnement et d'écrire **le même rapport**. CrewAI plafonne
`openai<3` quand Pydantic AI exige `openai>=3.31` (vérifié le 2026-11-15) : les
quatre frameworks ne peuvent pas cohabiter, donc le comparateur agrège des
rapports produits ailleurs plutôt que d'imposer un environnement unique.

Les trois règles du rapport vivent ici, une fois, pour tous les producteurs :

- **pas de latence en `replay`** : une cassette répond en microsecondes, ce
  n'est pas la vitesse du modèle. Les latences restent `null`, sinon le rapport
  ne serait pas reproductible ;
- **pas de note de porte pour qui ne rend pas de verdict** : un rédacteur a
  `null`, pas `0` ;
- **une erreur est comptée et nommée** avec le cas qui l'a provoquée.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

VerdictKind = Literal["passe", "echoue", "incertain"]

#: A verdict, as `pydantic-verdict` renders it: "Verdict : passe." on line one.
VERDICT_PREFIX = "Verdict : "


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
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    replay: bool = False
    cases: list[str] = Field(default_factory=list)
    results: list[Measure] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


@dataclass
class Attempt:
    """One case, run once: what the rules below need, and nothing else."""

    case: Case
    answer: str = ""
    tokens: int = 0
    ms: float = 0.0
    error: str | None = None


@dataclass
class Tally:
    """The measures of one specialist, accumulated then summarised."""

    specialist: str
    framework: str
    framework_version: str
    attempts: list[Attempt] = field(default_factory=list)

    def measure(self, *, replay: bool, url: str | None = None) -> Measure:
        tokens = sum(a.tokens for a in self.attempts)
        errors = sum(1 for a in self.attempts if a.error)
        latencies = [a.ms for a in self.attempts if not a.error]
        judged = [a for a in self.attempts if a.case.expected_verdict and verdict_of(a.answer)]
        passed = [a for a in judged if verdict_of(a.answer) == a.case.expected_verdict]
        return Measure(
            specialist=self.specialist,
            framework=self.framework,
            framework_version=self.framework_version,
            cases=len(self.attempts),
            tokens=tokens,
            errors=errors,
            gate_success=(len(passed) / len(judged)) if judged else None,
            latency_p50_ms=None if replay else percentile(latencies, 0.50),
            latency_p95_ms=None if replay else percentile(latencies, 0.95),
            experiment_url=url,
        )


def verdict_of(answer: str) -> VerdictKind | None:
    """The verdict a judge rendered, or None when the answer is not one."""
    first = answer.strip().splitlines()[0] if answer.strip() else ""
    if not first.startswith(VERDICT_PREFIX):
        return None
    value = first[len(VERDICT_PREFIX) :].rstrip(". ").strip()
    if value in ("passe", "echoue", "incertain"):
        return value  # type: ignore[return-value]
    return None


def percentile(values: list[float], share: float) -> float:
    """Nearest-rank percentile: no interpolation, no invented smoothness."""
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = max(1, round(share * len(ordered)))
    return ordered[min(rank, len(ordered)) - 1]


def load_cases(path: Path) -> list[Case]:
    return [Case.model_validate(item) for item in json.loads(path.read_text(encoding="utf-8"))]


def merge(report: ComparisonReport, others: list[ComparisonReport]) -> ComparisonReport:
    """One report per environment, merged by specialist name.

    A measure produced elsewhere replaces the same name; everything else is
    kept, and the case list is the union so a reader sees what was compared.
    """
    by_name = {measure.specialist: measure for measure in report.results}
    names = list(report.cases)
    for other in others:
        for measure in other.results:
            by_name[measure.specialist] = measure
        for name in other.cases:
            if name not in names:
                names.append(name)
        report.errors.extend(other.errors)
    return ComparisonReport(
        created_at=report.created_at,
        replay=report.replay and all(other.replay for other in others),
        cases=names,
        results=list(by_name.values()),
        errors=report.errors,
    )


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


def dump(report: ComparisonReport) -> str:
    return json.dumps(report.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n"


def as_report(payload: Any) -> ComparisonReport:
    return ComparisonReport.model_validate(payload)
