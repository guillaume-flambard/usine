"""Ce que le graphe voit d'un Specialist : un nœud (MEM-27).

Budget et traces ne peuvent pas être la responsabilité de chaque framework, sinon
les quatre dériveraient. Ils sont appliqués ici, une fois :

- la durée est une **borne dure** (`asyncio.wait_for`) : le spécialiste est
  annulé au-delà ;
- les jetons et les appels d'outils sont vérifiés **après** la réponse : une
  implémentation sait ce qu'elle a consommé, l'adaptateur seul décide si c'est
  trop, et lève `BudgetExceeded` ;
- la trace porte l'identité du spécialiste (nom, framework, version) pour que
  Langfuse montre quatre frameworks de la même façon.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from typing import Any, TypeVar, cast

from langchain_core.runnables import Runnable, RunnableLambda

from usine_api.specialists.contract import (
    Budget,
    Specialist,
    SpecialistInput,
    SpecialistOutput,
    ToolName,
)
from usine_api.specialists.contract import execute as run_within_budget


def traced(specialist: Specialist) -> Runnable[SpecialistInput, SpecialistOutput]:
    """The specialist as a named run: one span per call, in every framework."""
    return RunnableLambda(specialist.run).with_config(
        {
            "run_name": f"specialist:{specialist.identity.name}",
            "metadata": {
                "specialist": specialist.identity.name,
                "framework": specialist.identity.framework,
                "framework_version": specialist.identity.framework_version,
            },
        }
    )


class _Traced:
    """The specialist seen by the budget: one named run, then the contract's."""

    def __init__(self, specialist: Specialist) -> None:
        self.identity = specialist.identity
        self._run = traced(specialist)

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        output: SpecialistOutput = await self._run.ainvoke(task)
        return output


async def execute(
    specialist: Specialist,
    task: str,
    budget: Budget,
    *,
    tools: tuple[ToolName, ...] = (),
) -> SpecialistOutput:
    """Run one sub-task under the budget, traced, and refuse what goes past it."""
    return await run_within_budget(_Traced(specialist), task, budget, tools=tools)


StateIn = TypeVar("StateIn", bound=Mapping[str, Any])
StateOut = TypeVar("StateOut", bound=dict[str, Any])


def with_brief(state: Any) -> str:
    """The sub-task, preceded by the brief it comes from when they differ.

    The brief gives the exact names a sub-task may have dropped (repository,
    owner, file); the specialist is told to answer its sub-task only.
    """
    task = str(state["task"])
    brief = str(state.get("brief") or "").strip()
    if not brief or brief == task.strip():
        return task
    return (
        "Brief d'origine, pour les noms exacts (dépôt, propriétaire, fichier) :\n"
        f"{brief}\n\n"
        "Ta sous-tâche, à laquelle tu réponds seule :\n"
        f"{task}"
    )


def as_node(
    specialist: Specialist,
    budget: Budget,
    *,
    tools: tuple[ToolName, ...] = (),
) -> Callable[[StateIn], Awaitable[StateOut]]:
    """A LangGraph node: `{"task": ...}` in, `{"results": [output]}` out.

    That shape is the graph's `RunState.results` channel (supervisor.py), which
    gathers one output per specialist task.
    """

    async def run_task(state: StateIn) -> StateOut:
        output = await execute(specialist, with_brief(state), budget, tools=tools)
        return cast(StateOut, {"results": [output]})

    return run_task
