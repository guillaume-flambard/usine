/**
 * Contract of `POST /api/chat` (MEM-14), read by the real AI SDK.
 *
 * The streams in services/api/tests/fixtures/chat-stream/ are written by the
 * Python service (tests/test_chat_stream.py checks it still writes them byte for
 * byte). Here the installed `ai` package parses them with its own chunk schema
 * and builds the UIMessage that `useChat` would show. A drift on either side
 * fails one of the two tests.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  parseJsonEventStream,
  readUIMessageStream,
  uiMessageChunkSchema,
  type UIMessage,
  type UIMessageChunk,
} from 'ai'
import { RUN_EVENT_KINDS, type RunEventPayload } from '../contracts/ui-stream'

const FIXTURES = new URL('../../../../services/api/tests/fixtures/chat-stream/', import.meta.url)

function body(name: string): ReadableStream<Uint8Array> {
  const bytes = readFileSync(new URL(name, FIXTURES))
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes))
      controller.close()
    },
  })
}

/** The chunks, validated by the SDK's own schema, as DefaultChatTransport does. */
async function chunks(name: string): Promise<UIMessageChunk[]> {
  const parsed = parseJsonEventStream({ stream: body(name), schema: uiMessageChunkSchema })
  const out: UIMessageChunk[] = []
  for await (const result of parsed) {
    if (!result.success) throw result.error
    out.push(result.value as UIMessageChunk)
  }
  return out
}

async function lastMessage(list: UIMessageChunk[]): Promise<UIMessage | undefined> {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      list.forEach((chunk) => controller.enqueue(chunk))
      controller.close()
    },
  })
  let last: UIMessage | undefined
  for await (const message of readUIMessageStream({ stream })) last = message
  return last
}

describe('chat stream contract (ai@7.0.165)', () => {
  it('parses a run and builds the message useChat shows', async () => {
    const list = await chunks('ok.sse')
    expect(list[0]).toMatchObject({ type: 'start', messageMetadata: { threadId: 'chat-1' } })
    expect(list.at(-1)).toEqual({ type: 'finish', finishReason: 'stop' })

    const message = await lastMessage(list)
    const text = message?.parts.find((part) => part.type === 'text')
    expect(text).toMatchObject({ type: 'text', text: 'fait : relire les portes', state: 'done' })

    const events = message?.parts
      .filter((part) => part.type === 'data-run-event')
      .map((part) => (part as { data: RunEventPayload }).data)
    expect(events?.map((event) => event.kind)).toEqual([
      'run-started',
      'node-started',
      'node-finished',
      'node-started',
      'node-finished',
      'node-started',
      'node-finished',
      'run-finished',
    ])
    for (const event of events ?? []) expect(RUN_EVENT_KINDS).toContain(event.kind)
  })

  it('carries a model error as a readable error chunk', async () => {
    const list = await chunks('model-error.sse')
    const error = list.find((chunk) => chunk.type === 'error')
    expect(error).toMatchObject({ type: 'error' })
    expect((error as { errorText: string }).errorText).toMatch(/^Le modèle est saturé/)
    expect(list.at(-1)).toEqual({ type: 'finish', finishReason: 'error' })
  })
})
