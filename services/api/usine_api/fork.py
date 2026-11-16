"""Forker un run depuis un de ses checkpoints (MEM-23).

C'est la primitive de l'atelier : rejouer une trajectoire jusqu'à un point, puis
la faire diverger sur une branche à part, sans toucher au tronçon commun.

Ce que la doc de LangGraph dit, et qui a été vérifié dans la source installée
(langgraph 1.2.22, langgraph-checkpoint 4.3.2) :

- `get_state_history(thread)` rend les checkpoints du plus récent au plus
  ancien, chacun avec son `config` (qui porte `checkpoint_id`), son `next` (les
  nœuds qui restent à exécuter) et ses `values`.
  https://docs.langchain.com/oss/python/langgraph/use-time-travel
- `update_state(config, values, as_node=...)` **ne rembobine pas** le thread : il
  écrit un nouveau checkpoint, et l'historique d'origine reste intact. Les
  valeurs passent par les écrivains du nœud nommé, réducteurs compris
  (`langgraph/pregel/main.py`, `abulk_update_state`).
- Les nœuds situés avant le point de reprise ne sont pas ré-exécutés ; ceux qui
  suivent le sont, appels de modèle et `interrupt()` compris.

Une branche reçoit son propre `thread_id` : c'est ce qui la rend lisible à côté
du run d'origine. On l'amorce sur un thread neuf avec `as_node`, parce que
LangGraph infère le nœud depuis l'historique du thread et qu'un thread neuf n'en
a pas (`InvalidUpdateError: Ambiguous update, specify as_node`). Deux amorçages :

- au point d'entrée (`as_node="__input__"`, `langgraph/_internal/_constants.py`),
  ce qui repasse par le superviseur : c'est le fork « avec une nouvelle
  consigne » ;
- après le nœud qui a produit le checkpoint choisi, ce qui reprend exactement là
  où le run en était : fork « à l'étape 3 », sans replanifier.
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import StateSnapshot
from pydantic import BaseModel

from usine_api.specialists import UnknownSpecialist
from usine_api.specialists.contract import Specialist
from usine_api.threads import RunDetail, RunParent, ThreadIndex, title_of

#: `as_node` pour amorcer un thread neuf comme s'il recevait le brief.
#: La valeur est celle de `INPUT` dans `langgraph/_internal/_constants.py` : le
#: module est privé, la constante ne l'est pas dans les faits, et un test la
#: vérifie contre la source pour qu'une montée de version ne la change pas en
#: silence.
AS_INPUT = "__input__"

TRACE_URL = "https://docs.langchain.com/oss/python/langgraph/use-time-travel"


class ForkRefused(Exception):
    """Le fork ne peut pas se faire ; le message dit pourquoi, à l'écran."""


class UnknownCheckpoint(Exception):
    """Le checkpoint demandé n'appartient pas à ce run."""


class CheckpointSummary(BaseModel):
    """Ce qu'un client a besoin de savoir pour choisir un point de fork."""

    checkpoint_id: str
    step: int | None = None
    source: str | None = None
    # The nodes the graph would run from here: empty means the run is over.
    next: list[str]


class ForkRequest(BaseModel):
    checkpoint_id: str | None = None
    # A new instruction: the branch replans from the start with this brief.
    brief: str | None = None
    # The implementation the branch runs (MEM-33). None: the service default.
    specialist: str | None = None


class Forked(BaseModel):
    """The branch, and the brief its continuation runs with."""

    detail: RunDetail
    brief: str


def checkpoint_id_of(snapshot: StateSnapshot) -> str | None:
    value = snapshot.config["configurable"].get("checkpoint_id")
    return str(value) if value is not None else None


def metadata_of(snapshot: StateSnapshot) -> dict[str, Any]:
    return dict(snapshot.metadata or {})


def history_of(
    states: list[StateSnapshot],
) -> list[StateSnapshot]:
    """The main thread's checkpoints, newest first, without subgraph namespaces."""
    return [s for s in states if not s.config["configurable"].get("checkpoint_ns")]


def summarise(snapshot: StateSnapshot) -> CheckpointSummary:
    metadata = metadata_of(snapshot)
    return CheckpointSummary(
        checkpoint_id=checkpoint_id_of(snapshot) or "",
        step=metadata.get("step"),
        source=metadata.get("source"),
        next=list(snapshot.next),
    )


def choose(states: list[StateSnapshot], checkpoint_id: str | None) -> StateSnapshot:
    """The checkpoint to fork from: the one asked for, else the entry point."""
    if not states:
        raise ForkRefused("Ce run n'a aucun checkpoint : rien à forker.")
    if checkpoint_id is not None:
        for state in states:
            if checkpoint_id_of(state) == checkpoint_id:
                return state
        raise UnknownCheckpoint("Ce checkpoint n'appartient pas à ce run.")
    for state in states:
        if metadata_of(state).get("source") == "input":
            return state
    return states[-1]


def seed_of(
    states: list[StateSnapshot],
    chosen: StateSnapshot,
    brief: str | None,
) -> tuple[str, dict[str, Any]]:
    """What to write into the branch, and as which node: (as_node, values)."""
    entry = metadata_of(chosen).get("source") == "input"
    if brief is not None:
        if not entry:
            raise ForkRefused(
                "Une nouvelle consigne repart du début : donnez le checkpoint "
                "d'entrée, ou aucune consigne pour reprendre où le run en était."
            )
        return AS_INPUT, {"brief": brief}
    if entry:
        return AS_INPUT, {"brief": str(chosen.values.get("brief", ""))}

    # The node that produced this checkpoint is the one the older checkpoint was
    # about to run. Parallel tasks of the same node count once.
    position = states.index(chosen)
    producer = states[position + 1].next if position + 1 < len(states) else ()
    names = sorted(set(producer))
    if len(names) != 1:
        raise ForkRefused(
            "Ce checkpoint suit plusieurs nœuds à la fois : impossible de savoir duquel repartir."
        )
    return names[0], dict(chosen.values)


async def fork_run(
    graph: CompiledStateGraph[Any, Any, Any, Any],
    index: ThreadIndex,
    *,
    thread_id: str,
    owner: str | None,
    request: ForkRequest,
    available: Mapping[str, Specialist] | None = None,
    new_id: str | None = None,
) -> Forked:
    """Create the branch, seed it, and return it as the index sees it.

    The branch is seeded but not executed: the caller streams it with
    `resume=True`, which is what makes it diverge. A branch seeded at the entry
    point has its brief in a pending input write, not in its state, so the
    brief travels with this result instead of being read back from the graph.
    """
    if request.specialist is not None and request.specialist not in (available or {}):
        # Never a silent fallback to the default: a branch that asked for an
        # implementation it cannot have must not run as another one.
        raise UnknownSpecialist(request.specialist)
    states = history_of([s async for s in graph.aget_state_history(_config(thread_id))])
    chosen = choose(states, request.checkpoint_id)
    if not chosen.next:
        raise ForkRefused("Ce checkpoint a déjà terminé le run : rien à rejouer.")
    if "act" in chosen.next:
        # The decision is already in this state: forking here would run the
        # approved action a second time, with no one asked (MEM-84 review).
        # Fork before the gate to decide again.
        raise ForkRefused(
            "Ce checkpoint suit une décision de la porte : le forker relancerait "
            "l'action approuvée. Forkez avant la porte pour décider à nouveau."
        )
    as_node, values = seed_of(states, chosen, request.brief)

    branch = new_id or uuid.uuid4().hex
    parent = RunParent(thread_id=thread_id, checkpoint_id=checkpoint_id_of(chosen))
    brief = request.brief or str(values.get("brief", ""))
    if not index.fork(branch, owner, parent, title_of(brief), request.specialist):
        raise ForkRefused("Cet identifiant de branche est déjà pris.")
    try:
        await graph.aupdate_state(_config(branch), values, as_node=as_node)
    except Exception as error:  # noqa: BLE001 - the index row must not outlive a failed seed
        index.delete(branch, owner)
        raise ForkRefused(f"La branche n'a pas pu être amorcée : {error}") from error

    detail = index.get(branch, owner)
    if detail is None:  # pragma: no cover - the row was just written
        raise ForkRefused("La branche n'a pas pu être enregistrée.")
    return Forked(detail=detail, brief=brief)


def _config(thread_id: str) -> RunnableConfig:
    return {"configurable": {"thread_id": thread_id}}
