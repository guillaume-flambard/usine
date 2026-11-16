"""`POST /api/chat`: a supervisor graph run, streamed as an AI SDK UI message stream (MEM-14).

Protocol read in the installed `ai@7.0.165` package (`apps/web`), which is the
authority over the docs page (https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol,
which states no version and leaves fields out):

- headers: `UI_MESSAGE_STREAM_HEADERS`, among them `x-vercel-ai-ui-message-stream: v1`;
- one SSE event per chunk, `data: <json>` then a blank line, and `data: [DONE]`
  at the end;
- chunk shapes: `uiMessageChunkSchema`. A custom `data-*` chunk takes `id`,
  `data` and `transient`; `finish` takes `finishReason`;
- request body of `DefaultChatTransport`: `{id, messages, trigger, messageId}`.
  The chat `id` is the LangGraph `thread_id`.

What goes on the wire, in order: `start` (with the thread id in
`messageMetadata`), one `data-run-event` chunk per run event (the payload is a
`RunEvent`, so a recorded stream is a replayable run), the answer as text, then
`finish`. A failure is an `error` chunk with a readable French message, then
`finish` with `finishReason: "error"`: never a stream cut short in silence.

A client that goes away cancels the generator; the cancellation reaches the
graph run, whose nodes are async, so the model call in flight is cancelled too.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import aclosing
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from usine_api.contracts import RunEvent, RunEventKind, SpecialistOutput
from usine_api.errors import readable_error
from usine_api.graph.supervisor import ACT, HUMAN_GATE, SPECIALIST, SUPERVISOR, SYNTHESIZE
from usine_api.observability import record_gate_decision, run_config
from usine_api.threads import RunStatus, RunTurn, ThreadIndex

logger = logging.getLogger(__name__)

#: Response headers, as `UI_MESSAGE_STREAM_HEADERS` in ai@7.0.165.
STREAM_HEADERS = {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "connection": "keep-alive",
    "x-vercel-ai-ui-message-stream": "v1",
    "x-accel-buffering": "no",
}
RUN_EVENT_PART = "data-run-event"


class ChatMessage(BaseModel):
    """A `UIMessage`, reduced to what the service reads."""

    model_config = ConfigDict(extra="ignore")

    id: str = ""
    role: str
    parts: list[dict[str, Any]] = Field(default_factory=list)

    def text(self) -> str:
        return "".join(
            str(part.get("text", "")) for part in self.parts if part.get("type") == "text"
        ).strip()


class ChatRequest(BaseModel):
    """The body `DefaultChatTransport` sends (ai@7.0.165, `HttpChatTransport.sendMessages`)."""

    model_config = ConfigDict(extra="ignore")

    id: str | None = None
    messages: list[ChatMessage] = Field(min_length=1)
    trigger: str | None = None
    messageId: str | None = None

    def brief(self) -> str:
        """The last user message: each chat message is one run of the graph."""
        for message in reversed(self.messages):
            if message.role == "user":
                return message.text()
        return ""


def sse(chunk: dict[str, Any] | str) -> str:
    payload = chunk if isinstance(chunk, str) else json.dumps(chunk, ensure_ascii=False)
    return f"data: {payload}\n\n"


def _summary(node: str, payload: dict[str, Any], *, finished: bool) -> dict[str, Any]:
    """Plain JSON for the screen: never a live object (CLAUDE.md, rule 2)."""
    if node == SUPERVISOR and finished:
        return {"subtasks": list(payload.get("subtasks", []))}
    if node == SPECIALIST and not finished:
        return {"task": payload.get("task", "")}
    if node == SPECIALIST and finished:
        outputs: list[SpecialistOutput] = payload.get("results", [])
        return {
            "specialists": [
                {
                    "name": o.identity.name,
                    "framework": o.identity.framework,
                    "tokens": o.tokens,
                    # Which MCP tools ran (MEM-38): a trace says what it did.
                    "tools": list(o.tools),
                    # Why it did not finish; the others went on without it.
                    **({"failed": o.failed} if o.failed else {}),
                }
                for o in outputs
            ]
        }
    if node == SYNTHESIZE and finished and payload.get("proposed"):
        return {"proposed": len(payload["proposed"])}
    if node == ACT and finished:
        return {"executed": list(payload.get("executed", []))}
    return {}


async def run_stream(
    graph: Any,
    request: ChatRequest,
    *,
    new_id: Callable[[], str] = lambda: uuid.uuid4().hex,
    clock: Callable[[], float] = time.monotonic,
    user_id: str | None = None,
    index: ThreadIndex | None = None,
    owner: str | None = None,
    resume: bool = False,
    command: Any | None = None,
    specialist: str | None = None,
) -> AsyncIterator[str]:
    """The SSE body of one chat turn. `new_id` and `clock` are injected by tests.

    `index` records the turn (MEM-18). `resume` continues the thread from its
    last checkpoint instead of starting a new brief: the graph is given no input,
    which is how LangGraph resumes (https://docs.langchain.com/oss/python/langgraph/persistence).
    `command` is a `Command(resume=...)` answering a human gate (MEM-20).
    `specialist` pins this run to a named implementation (MEM-33): the graph
    resolves it from the run's own config, so one graph serves every framework.

    A gate stops the run: its interrupt becomes a `gate-opened` event, the turn
    is recorded as `waiting`, and the stream ends without `run-finished`.
    """
    thread_id = request.id or new_id()
    started = clock()
    recorded: list[dict[str, Any]] = []

    def event(kind: RunEventKind, *, node: str | None = None, **data: Any) -> str:
        run_event = RunEvent(kind=kind, at=round(clock() - started, 3), node=node, data=data)
        payload = run_event.model_dump(mode="json")
        recorded.append(payload)
        return sse({"type": RUN_EVENT_PART, "data": payload})

    def close_turn(answer: str, status: RunStatus) -> None:
        if index is not None:
            index.finish(thread_id, RunTurn(brief=brief, answer=answer, events=recorded), status)

    yield sse({"type": "start", "messageId": new_id(), "messageMetadata": {"threadId": thread_id}})
    brief = request.brief()
    if not brief:
        yield sse({"type": "error", "errorText": "Le message est vide : rien à lancer."})
        yield sse({"type": "finish", "finishReason": "error"})
        yield sse("[DONE]")
        return

    if index is not None and not index.start(thread_id, owner, brief):
        yield sse({"type": "error", "errorText": "Ce fil appartient à une autre organisation."})
        yield sse({"type": "finish", "finishReason": "error"})
        yield sse("[DONE]")
        return
    resumed = resume or command is not None
    # A resumed run continues the scene of the run it resumes (MEM-21).
    if resumed:
        yield event(RunEventKind.RUN_STARTED, threadId=thread_id, resumed=True)
    else:
        yield event(RunEventKind.RUN_STARTED, threadId=thread_id)
    # One short id per node run, in order of start. Parallel specialists share
    # the node name, so the scene (MEM-17) needs this to pair a finish with its
    # start. LangGraph's own task ids hold a time-based checkpoint id: a
    # recorded run must replay to the same read model, so they stay inside.
    task_ids: dict[str, str] = {}
    # A resumed stream numbers its tasks apart, so its ids never collide with
    # those of the run it continues in the same scene.
    id_prefix = f"r{new_id()[:6]}-" if resumed else "t"
    answer = ""
    waiting = False
    try:
        config = run_config(thread_id, user_id=user_id, specialist=specialist)
        # `aclosing`: when the client goes away, this generator is closed at a
        # `yield` (ASGI 2.4) or cancelled (older servers). Either way the graph
        # stream must be closed with it, which cancels the nodes still running;
        # a bare `async for` would leave them to the garbage collector.
        graph_input = command if command is not None else (None if resume else {"brief": brief})
        stream = graph.astream(graph_input, config, stream_mode=["tasks"], version="v2")
        async with aclosing(stream):
            async for chunk in stream:
                task = chunk["data"]
                node = task["name"]
                task_id = task_ids.setdefault(task["id"], f"{id_prefix}{len(task_ids) + 1}")
                if "input" in task:
                    payload = task["input"] if isinstance(task["input"], dict) else {}
                    yield event(
                        RunEventKind.NODE_STARTED,
                        node=node,
                        taskId=task_id,
                        **_summary(node, payload, finished=False),
                    )
                    continue
                if task.get("error") is not None:
                    raise task["error"]
                if task.get("interrupts"):
                    waiting = True
                    pending = task["interrupts"][0]
                    # Not LangGraph's interrupt id: it holds a time-based part,
                    # and a recorded run must replay alike. A run waits on one
                    # gate at a time, so the decision needs no id.
                    yield event(
                        RunEventKind.GATE_OPENED,
                        node=node,
                        taskId=task_id,
                        gate=pending["value"],
                    )
                    continue
                result = task.get("result") or {}
                if node == HUMAN_GATE:
                    yield event(
                        RunEventKind.GATE_DECIDED,
                        node=node,
                        taskId=task_id,
                        **result.get("decision", {}),
                    )
                    continue
                yield event(
                    RunEventKind.NODE_FINISHED,
                    node=node,
                    taskId=task_id,
                    **_summary(node, result, finished=True),
                )
                if node == SYNTHESIZE:
                    answer = str(result.get("answer", ""))
    except Exception as error:  # noqa: BLE001 - every failure becomes a readable chunk
        logger.exception("chat run failed (thread %s)", thread_id)
        # The scene marks the nodes still running as failed from this event:
        # a failure on screen is paid for by an event, like everything else.
        # The reason travels in the event too: the stream is the archive, and a
        # replayed or compared run must say why it failed (CLAUDE.md, rule 2).
        yield event(RunEventKind.RUN_FINISHED, outcome="error", error=readable_error(error))
        close_turn("", "error")
        yield sse({"type": "error", "errorText": readable_error(error)})
        yield sse({"type": "finish", "finishReason": "error"})
        yield sse("[DONE]")
        return

    if answer:
        text_id = new_id()
        yield sse({"type": "text-start", "id": text_id})
        yield sse({"type": "text-delta", "id": text_id, "delta": answer})
        yield sse({"type": "text-end", "id": text_id})
    if command is not None:
        record_gate_decision(config, thread_id, dict(command.resume or {}))
    if waiting:
        # Not finished: the run waits for a decision (POST /api/runs/{id}/gate).
        close_turn(answer, "waiting")
        yield sse({"type": "finish", "finishReason": "other"})
        yield sse("[DONE]")
        return
    yield event(RunEventKind.RUN_FINISHED, outcome="ok")
    close_turn(answer, "done")
    yield sse({"type": "finish", "finishReason": "stop"})
    yield sse("[DONE]")


async def no_model_stream() -> AsyncIterator[str]:
    """No gateway configured: say so in the protocol, instead of a bare 500."""
    yield sse({"type": "start"})
    yield sse({"type": "error", "errorText": "Aucun modèle n'est configuré sur ce service."})
    yield sse({"type": "finish", "finishReason": "error"})
    yield sse("[DONE]")
