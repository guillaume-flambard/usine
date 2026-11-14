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

import openai
from pydantic import BaseModel, ConfigDict, Field

from usine_api.contracts import RunEvent, RunEventKind, SpecialistOutput
from usine_api.graph.supervisor import SPECIALIST, SUPERVISOR, SYNTHESIZE

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


def readable_error(error: BaseException) -> str:
    """What the person reads. The detail goes to the log, never to the page."""
    if isinstance(error, openai.RateLimitError):
        return "Le modèle est saturé pour le moment (429). Réessayez dans une minute."
    if isinstance(error, openai.APITimeoutError):
        return "Le modèle n'a pas répondu à temps. Réessayez."
    if isinstance(error, openai.APIConnectionError):
        return "La passerelle de modèles est injoignable."
    if isinstance(error, openai.APIStatusError):
        return f"Le modèle a refusé la requête (erreur {error.status_code})."
    return "Le run a échoué sur une erreur interne. Elle est journalisée."


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
                {"name": o.identity.name, "framework": o.identity.framework, "tokens": o.tokens}
                for o in outputs
            ]
        }
    return {}


async def run_stream(
    graph: Any,
    request: ChatRequest,
    *,
    new_id: Callable[[], str] = lambda: uuid.uuid4().hex,
    clock: Callable[[], float] = time.monotonic,
) -> AsyncIterator[str]:
    """The SSE body of one chat turn. `new_id` and `clock` are injected by tests."""
    thread_id = request.id or new_id()
    started = clock()

    def event(kind: RunEventKind, *, node: str | None = None, **data: Any) -> str:
        run_event = RunEvent(kind=kind, at=round(clock() - started, 3), node=node, data=data)
        return sse({"type": RUN_EVENT_PART, "data": run_event.model_dump(mode="json")})

    yield sse({"type": "start", "messageId": new_id(), "messageMetadata": {"threadId": thread_id}})
    brief = request.brief()
    if not brief:
        yield sse({"type": "error", "errorText": "Le message est vide : rien à lancer."})
        yield sse({"type": "finish", "finishReason": "error"})
        yield sse("[DONE]")
        return

    yield event(RunEventKind.RUN_STARTED, threadId=thread_id)
    answer = ""
    try:
        config = {"configurable": {"thread_id": thread_id}}
        # `aclosing`: when the client goes away, this generator is closed at a
        # `yield` (ASGI 2.4) or cancelled (older servers). Either way the graph
        # stream must be closed with it, which cancels the nodes still running;
        # a bare `async for` would leave them to the garbage collector.
        stream = graph.astream({"brief": brief}, config, stream_mode=["tasks"], version="v2")
        async with aclosing(stream):
            async for chunk in stream:
                task = chunk["data"]
                node = task["name"]
                if "input" in task:
                    payload = task["input"] if isinstance(task["input"], dict) else {}
                    yield event(
                        RunEventKind.NODE_STARTED,
                        node=node,
                        **_summary(node, payload, finished=False),
                    )
                    continue
                if task.get("error") is not None:
                    raise task["error"]
                result = task.get("result") or {}
                yield event(
                    RunEventKind.NODE_FINISHED, node=node, **_summary(node, result, finished=True)
                )
                if node == SYNTHESIZE:
                    answer = str(result.get("answer", ""))
    except Exception as error:  # noqa: BLE001 - every failure becomes a readable chunk
        logger.exception("chat run failed (thread %s)", thread_id)
        yield sse({"type": "error", "errorText": readable_error(error)})
        yield sse({"type": "finish", "finishReason": "error"})
        yield sse("[DONE]")
        return

    text_id = new_id()
    yield sse({"type": "text-start", "id": text_id})
    yield sse({"type": "text-delta", "id": text_id, "delta": answer})
    yield sse({"type": "text-end", "id": text_id})
    yield event(RunEventKind.RUN_FINISHED)
    yield sse({"type": "finish", "finishReason": "stop"})
    yield sse("[DONE]")


async def no_model_stream() -> AsyncIterator[str]:
    """No gateway configured: say so in the protocol, instead of a bare 500."""
    yield sse({"type": "start"})
    yield sse({"type": "error", "errorText": "Aucun modèle n'est configuré sur ce service."})
    yield sse({"type": "finish", "finishReason": "error"})
    yield sse("[DONE]")
