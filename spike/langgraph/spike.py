# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "langgraph==1.2.22",
#   "langgraph-checkpoint-postgres==3.2.1",
#   "psycopg[binary]==3.3.9",
# ]
# ///
"""Spike MEM-10: a LangGraph StateGraph with a Postgres checkpointer.

Throwaway code, never imported by the product. It proves, on the versions above:

1. a run checkpointed in Postgres stops at a breakpoint in one process,
2. a NEW process resumes it with `invoke(None, config)` from the same thread_id,
3. streaming in v2 format carries both node updates and custom events,
4. the checkpoint history is readable newest first.

Usage (DSN in the environment, never on the command line):
    uv run --script spike.py start   # stops before "review"
    uv run --script spike.py resume  # new process, finishes the run
    uv run --script spike.py history
"""

from __future__ import annotations

import operator
import os
import sys
from typing import Annotated, TypedDict

from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph

THREAD = {"configurable": {"thread_id": "spike-mem-10"}}


class State(TypedDict):
    brief: str
    steps: Annotated[list[str], operator.add]


def plan(state: State) -> dict:
    # A custom event, the way the run will report reasoning to the UI stream.
    get_stream_writer()({"kind": "reasoning-started", "node": "plan"})
    return {"steps": [f"plan:{state['brief']}"]}


def review(state: State) -> dict:
    return {"steps": ["review:ok"]}


def build(checkpointer: PostgresSaver):
    graph = StateGraph(State)
    graph.add_node("plan", plan)
    graph.add_node("review", review)
    graph.add_edge(START, "plan")
    graph.add_edge("plan", "review")
    graph.add_edge("review", END)
    # Static breakpoint: the run pauses before "review" (the human gate, later).
    return graph.compile(checkpointer=checkpointer, interrupt_before=["review"])


def main(phase: str) -> None:
    with PostgresSaver.from_conn_string(os.environ["SPIKE_PG_DSN"]) as saver:
        saver.setup()
        app = build(saver)
        if phase == "start":
            for chunk in app.stream(
                {"brief": "relire les portes", "steps": []},
                THREAD,
                stream_mode=["updates", "custom"],
                version="v2",
            ):
                print("chunk", chunk["type"], chunk["data"])
            print("next:", app.get_state(THREAD).next)
        elif phase == "resume":
            result = app.invoke(None, THREAD)
            print("steps:", result["steps"])
            print("next:", app.get_state(THREAD).next)
        elif phase == "history":
            history = list(app.get_state_history(THREAD))
            print("checkpoints:", len(history))
            for snapshot in history:
                print(
                    " ",
                    snapshot.config["configurable"]["checkpoint_id"][:13],
                    snapshot.next,
                    snapshot.values.get("steps"),
                )


if __name__ == "__main__":
    main(sys.argv[1])
