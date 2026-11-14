/**
 * The parts of the Vercel AI SDK "UI message stream" the web app consumes
 * (docs/architecture/v2.md, MEM-14).
 *
 * Protocol: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol, read in the
 * installed `ai@7.0.165` (`uiMessageChunkSchema`, `UI_MESSAGE_STREAM_HEADERS`),
 * which states more than the page. `POST /api/chat` sends `start` (thread id in
 * `messageMetadata.threadId`), `data-run-event` parts, the answer as text, then
 * `finish`; a failure is an `error` part then `finish` with `finishReason: "error"`.
 * Recorded examples: services/api/tests/fixtures/chat-stream/.
 *
 * Run events travel as custom `data-*` parts, whose payload mirrors
 * services/api/usine_api/contracts/run_event.py.
 */

export type StandardPartType =
  'start' | 'text-start' | 'text-delta' | 'text-end' | 'error' | 'finish'

/** Custom parts carrying the run read model. Names are ours, prefixed `data-`. */
export type RunDataPartType = 'data-run-event'

/** Same values as RunEventKind in Python; a test keeps the two aligned. */
export const RUN_EVENT_KINDS = [
  'run-started',
  'node-started',
  'node-finished',
  'reasoning-started',
  'reasoning-settled',
  'tool-called',
  'gate-opened',
  'gate-decided',
  'run-finished',
] as const

export type RunEventKind = (typeof RUN_EVENT_KINDS)[number]

export interface RunEventPayload {
  kind: RunEventKind
  /** Seconds since the start of the run. Never an absolute date. */
  at: number
  node?: string | null
  data?: Record<string, unknown>
}

export const UI_STREAM_HEADER = 'x-vercel-ai-ui-message-stream'
export const UI_STREAM_VERSION = 'v1'
