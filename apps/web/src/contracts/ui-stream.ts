/**
 * The parts of the Vercel AI SDK "UI message stream" the web app consumes
 * (docs/architecture/v2.md, MEM-14).
 *
 * Protocol: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
 * (header `x-vercel-ai-ui-message-stream: v1`, SSE `data:` lines, `[DONE]`).
 *
 * Only the standard text parts are typed here. Run events travel as custom
 * `data-*` parts, whose payload mirrors services/api/usine_api/contracts/run_event.py.
 */

export type StandardPartType = 'start' | 'text-start' | 'text-delta' | 'text-end' | 'finish'

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
