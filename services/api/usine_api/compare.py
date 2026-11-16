"""Comparateur de spécialistes (MEM-34) : même entrée, coût, latence, verdict.

Le même jeu de cas figés passe dans chaque implémentation, et le rapport donne
par framework le taux de réussite des portes, les jetons, la latence p50 et p95,
et les erreurs. Chaque spécialiste est aussi écrit comme **une expérience
Langfuse** (`run_experiment`, client 5.2), ce qui donne un lien à cliquer.

Les règles du rapport (pas de latence en `replay`, pas de note de porte pour qui
ne rend pas de verdict, une erreur comptée et nommée) vivent dans
`usine_api/comparison.py`, sans dépendance de framework : c'est ce qui permet à
un framework de tourner dans son propre environnement et d'écrire le même
rapport (`scripts/compare-one.py`), puis de le faire fusionner ici (`--merge`).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from usine_api.comparison import (
    Attempt,
    Case,
    ComparisonReport,
    Tally,
    as_report,
    dump,
    load_cases,
    merge,
    render,
    verdict_of,
)
from usine_api.contracts import Budget
from usine_api.specialists.contract import Specialist
from usine_api.specialists.node import execute

#: What one comparison is allowed to spend per case and per specialist.
COMPARE_BUDGET = Budget(max_tokens=2_000, max_seconds=180, max_tool_calls=0)

#: The frozen cases. Small on purpose: a case set that drifts measures nothing.
# USINE_ROOT: in the image the package lives in the venv, away from the repo (app._repo_root).
CASES_PATH = (
    (
        Path(os.environ["USINE_ROOT"]) / "services" / "api"
        if os.environ.get("USINE_ROOT")
        else Path(__file__).parent.parent
    )
    / "compare"
    / "cases.json"
)


class CompareRequest(BaseModel):
    """Which specialists to compare; empty means all of them."""

    specialists: list[str] = Field(default_factory=list)


async def _attempt(specialist: Specialist, case: Case, limits: Budget) -> Attempt:
    started = time.perf_counter()
    try:
        output = await execute(specialist, case.task, limits)
    except Exception as error:  # noqa: BLE001 - an error is a measure, not a crash
        return Attempt(case=case, error=str(error))
    return Attempt(
        case=case,
        answer=output.answer,
        tokens=output.tokens,
        ms=(time.perf_counter() - started) * 1000,
    )


async def compare(
    specialists: Mapping[str, Specialist],
    cases: list[Case],
    *,
    budget: Budget = COMPARE_BUDGET,
    replay: bool = False,
    client: Any | None = None,
    experiment: str = "usine/compare",
) -> ComparisonReport:
    """Run every case through every specialist, and measure the same things."""
    report = ComparisonReport(replay=replay, cases=[case.name for case in cases])

    for name, specialist in specialists.items():
        tally = Tally(name, specialist.identity.framework, specialist.identity.framework_version)
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
                *,
                item: Any,
                _tally: Tally = tally,
                _cases: Any = by_task,
                _specialist: Specialist = specialist,
                **_: Any,
            ) -> str:
                # The SDK hands a dict here, not the LocalExperimentItem it was given.
                text = item["input"] if isinstance(item, dict) else item.input
                attempt = await _attempt(_specialist, _cases[text], budget)
                _tally.attempts.append(attempt)
                return attempt.answer

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
                tally.attempts.append(await _attempt(specialist, case, budget))

        report.results.append(tally.measure(replay=replay, url=url))
        report.errors.extend(
            f"{name} / {attempt.case.name} : {attempt.error}"
            for attempt in tally.attempts
            if attempt.error
        )
    return report


def _live_specialists(only: list[str] | None = None) -> dict[str, Specialist]:
    """What the service can run for real: built here, from the same settings."""
    from usine_api.graph.specialist import ChatModelSpecialist
    from usine_api.models import model_settings
    from usine_api.specialists.openai_agents import OpenAIAgentsSpecialist
    from usine_api.specialists.pydantic_verdict import PydanticVerdictSpecialist

    settings = model_settings()
    if settings is None:
        raise SystemExit("LITELLM_BASE_URL n'est pas défini : aucun modèle à comparer.")
    built: dict[str, Specialist] = {
        "chat-model": ChatModelSpecialist(settings),
        "pydantic-verdict": PydanticVerdictSpecialist(settings),
        "openai-agents": OpenAIAgentsSpecialist(settings),
    }
    if only:
        built = {name: instance for name, instance in built.items() if name in only}
    return built


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True, help="le rapport Markdown à écrire")
    parser.add_argument("--json", type=Path, default=None, help="le même rapport, en JSON")
    parser.add_argument(
        "--merge",
        type=Path,
        action="append",
        default=[],
        help="un rapport produit ailleurs (autre environnement), à fusionner",
    )
    parser.add_argument(
        "--only",
        action="append",
        default=None,
        help="ne comparer que ce spécialiste (répétable)",
    )
    parser.add_argument("--replay", action="store_true", help="sans réseau (cassettes)")
    arguments = parser.parse_args()

    client = None
    if not arguments.replay:
        from usine_api.observability import tracing_configured

        if tracing_configured():
            from langfuse import get_client

            client = get_client()

    report = asyncio.run(
        compare(
            _live_specialists(arguments.only),
            load_cases(CASES_PATH),
            replay=arguments.replay,
            client=client,
        )
    )
    if arguments.merge:
        report = merge(
            report,
            [as_report(json.loads(path.read_text(encoding="utf-8"))) for path in arguments.merge],
        )

    arguments.out.parent.mkdir(parents=True, exist_ok=True)
    arguments.out.write_text(render(report), encoding="utf-8")
    if arguments.json is not None:
        arguments.json.write_text(dump(report), encoding="utf-8")
    print(render(report))


if __name__ == "__main__":
    main()
