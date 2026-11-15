#!/usr/bin/env python
"""Enregistre une cassette depuis la passerelle de modèles du lab (MEM-24).

C'est ainsi que `cassettes/demo.json` a été produite : un vrai run, un vrai
modèle, et la réponse gardée telle quelle. Un run rejoué plus tard ne coûte
rien, ne dépend de personne, et reste ce que le modèle a réellement dit.

    LITELLM_BASE_URL=... LITELLM_API_KEY=... \\
    uv run python services/api/scripts/record-cassette.py \\
        --brief "..." --out services/api/cassettes/demo.json

À relancer quand on veut une démo plus fraîche ; le fichier est du JSON lisible,
donc relisible en revue.
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

import httpx
from langgraph.checkpoint.memory import InMemorySaver

from usine_api.cassette import Cassette, CassetteTransport
from usine_api.graph import build_graph
from usine_api.graph.planner import ChatModelPlanner
from usine_api.graph.specialist import ChatModelSpecialist
from usine_api.models import model_settings


async def record(brief: str, out: Path) -> None:
    settings = model_settings()
    if settings is None:
        raise SystemExit("LITELLM_BASE_URL n'est pas défini : rien à enregistrer.")

    cassette = Cassette(
        source=f"{settings.base_url} / {settings.model}", model=settings.model, brief=brief
    )
    transport = CassetteTransport(cassette, "record", path=out)
    async with httpx.AsyncClient(transport=transport, timeout=120.0) as client:
        graph = build_graph(
            ChatModelPlanner(settings, http_client=client),
            ChatModelSpecialist(settings, http_client=client),
            checkpointer=InMemorySaver(),
        )
        result = await graph.ainvoke(
            {"brief": brief}, {"configurable": {"thread_id": "demo-recording"}}
        )

    print(f"{len(cassette.entries)} appels enregistrés dans {out}")
    print(f"réponse : {str(result.get('answer', ''))[:200]}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brief", required=True, help="le brief que la démo rejouera")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("services/api/cassettes/demo.json"),
        help="fichier cassette",
    )
    arguments = parser.parse_args()
    asyncio.run(record(arguments.brief, arguments.out))


if __name__ == "__main__":
    main()
