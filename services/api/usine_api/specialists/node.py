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

import asyncio
from collections.abc import Awaitable, Callable, Mapping
from typing import Any, TypeVar, cast

from langchain_core.runnables import Runnable, RunnableLambda

from usine_api.specialists.contract import (
    Budget,
    BudgetExceeded,
    Specialist,
    SpecialistInput,
    SpecialistOutput,
    ToolName,
)


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


async def execute(
    specialist: Specialist,
    task: str,
    budget: Budget,
    *,
    tools: tuple[ToolName, ...] = (),
) -> SpecialistOutput:
    """Run one sub-task under the budget, and refuse what goes past it."""
    entry = SpecialistInput(task=task, budget=budget, tools=tools)
    try:
        output = await asyncio.wait_for(
            traced(specialist).ainvoke(entry), timeout=budget.max_seconds
        )
    except TimeoutError as error:
        raise BudgetExceeded(
            "durée",
            specialist=specialist.identity,
            limit=budget.max_seconds,
            actual=budget.max_seconds,
        ) from error
    if output.tokens > budget.max_tokens:
        raise BudgetExceeded(
            "jetons",
            specialist=specialist.identity,
            limit=budget.max_tokens,
            actual=output.tokens,
        )
    if output.tool_calls > budget.max_tool_calls:
        raise BudgetExceeded(
            "appels d'outils",
            specialist=specialist.identity,
            limit=budget.max_tool_calls,
            actual=output.tool_calls,
        )
    return output


StateIn = TypeVar("StateIn", bound=Mapping[str, Any])
StateOut = TypeVar("StateOut", bound=dict[str, Any])


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
        output = await execute(specialist, str(state["task"]), budget, tools=tools)
        return cast(StateOut, {"results": [output]})

    return run_task
