#!/usr/bin/env python
"""Mesure un seul spécialiste dans son propre environnement (MEM-34).

CrewAI et Pydantic AI ne peuvent pas cohabiter (`openai<3` contre
`openai>=3.31`) : ce script tourne donc là où le framework est installé, écrit
un rapport au même format que `python -m usine_api.compare`, et le comparateur
fusionne les deux (`--merge`).

    PYTHONPATH=services/api python scripts/compare-one.py --specialist crewai --out crewai.json

Il n'importe ni LangChain, ni Pydantic AI, ni le client Langfuse : juste le
contrat, les règles du rapport, et l'adaptateur demandé.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path
from typing import Any

from usine_api.comparison import Attempt, ComparisonReport, Tally, dump, load_cases
from usine_api.contracts import Budget
from usine_api.specialists.contract import Gateway, execute

DEFAULT_CASES = Path(__file__).resolve().parents[1] / "compare" / "cases.json"
BUDGET = Budget(max_tokens=2_000, max_seconds=180, max_tool_calls=0)


def build(name: str, gateway: Gateway) -> Any:
    """Load the adapter by name, without importing the others."""
    from importlib import import_module

    modules = {
        "crewai": "usine_api.specialists.crewai",
        "pydantic-verdict": "usine_api.specialists.pydantic_verdict",
        "openai-agents": "usine_api.specialists.openai_agents",
        "chat-model": "usine_api.graph.specialist",
    }
    if name not in modules:
        raise SystemExit(f"spécialiste inconnu : {name} (connus : {', '.join(modules)})")
    module = import_module(modules[name])
    classes = {
        "crewai": "CrewAISpecialist",
        "pydantic-verdict": "PydanticVerdictSpecialist",
        "openai-agents": "OpenAIAgentsSpecialist",
        "chat-model": "ChatModelSpecialist",
    }
    return getattr(module, classes[name])(gateway)


def gateway_from_env() -> Any:
    """The gateway, read here rather than from `usine_api.models`.

    `models.py` imports LangChain, which this environment may not have. The
    default model name mirrors `models.DEFAULT_MODEL`; a test in the main
    environment asserts the two agree, so they cannot drift quietly.
    """
    import os
    from types import SimpleNamespace

    base_url = os.environ.get("LITELLM_BASE_URL", "").rstrip("/")
    if not base_url:
        raise SystemExit("LITELLM_BASE_URL n'est pas défini : aucun modèle à comparer.")
    return SimpleNamespace(
        base_url=base_url,
        api_key=os.environ.get("LITELLM_API_KEY", ""),
        model=os.environ.get("USINE_MODEL") or "lab-fast",
    )


async def measure(name: str, cases_path: Path) -> ComparisonReport:
    specialist = build(name, gateway_from_env())
    tally = Tally(name, specialist.identity.framework, specialist.identity.framework_version)
    for case in load_cases(cases_path):
        started = time.perf_counter()
        try:
            output = await execute(specialist, case.task, BUDGET)
        except Exception as error:  # noqa: BLE001 - an error is a measure
            tally.attempts.append(Attempt(case=case, error=str(error)))
            continue
        tally.attempts.append(
            Attempt(
                case=case,
                answer=output.answer,
                tokens=output.tokens,
                ms=(time.perf_counter() - started) * 1000,
            )
        )
    report = ComparisonReport(cases=[case.name for case in load_cases(cases_path)])
    report.results.append(tally.measure(replay=False, url=None))
    report.errors.extend(
        f"{name} / {attempt.case.name} : {attempt.error}"
        for attempt in tally.attempts
        if attempt.error
    )
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--specialist", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    arguments = parser.parse_args(argv)

    report = asyncio.run(measure(arguments.specialist, arguments.cases))
    arguments.out.write_text(dump(report), encoding="utf-8")
    print(f"{arguments.specialist} : {arguments.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
