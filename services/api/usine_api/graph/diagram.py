"""Write the supervisor graph diagram to docs/ (Mermaid, drawn by LangGraph).

    uv run python -m usine_api.graph.diagram

A test compares the versioned file with the live graph, so the diagram in the
docs can never describe a graph that no longer exists.
"""

from __future__ import annotations

from pathlib import Path

from usine_api.contracts import SpecialistInput, SpecialistOutput
from usine_api.graph.supervisor import build_graph

TARGET = Path(__file__).resolve().parents[4] / "docs/architecture/supervisor-graph.mmd"


class _NoPlanner:
    def plan(self, brief: str) -> list[str]:
        return []


class _NoSpecialist:
    def run(self, task: SpecialistInput) -> SpecialistOutput:
        raise NotImplementedError


def main() -> None:
    TARGET.write_text(
        build_graph(_NoPlanner(), _NoSpecialist()).get_graph().draw_mermaid(), encoding="utf-8"
    )
    print(f"written {TARGET}")


if __name__ == "__main__":
    main()
