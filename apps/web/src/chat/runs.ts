/**
 * The runs API (MEM-18) seen from the web: list, open, and turn a run back into
 * the messages `useChat` shows. Shapes mirror services/api/openapi.json.
 */
import type { UIMessage } from 'ai'
import type { RunEventPayload } from '../contracts/ui-stream'

export interface RunSummary {
  thread_id: string
  title: string
  status: 'running' | 'done' | 'error'
  created_at: string
  turns: number
}

export interface RunTurn {
  brief: string
  answer: string
  events: RunEventPayload[]
}

export interface RunDetail extends RunSummary {
  history: RunTurn[]
}

export interface RunPage {
  items: RunSummary[]
  next_cursor: string | null
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Le service a répondu ${response.status}.`)
  return (await response.json()) as T
}

export async function fetchRuns(
  cursor: string | null = null,
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): Promise<RunPage> {
  const query = new URLSearchParams({ limit: '20', ...(cursor ? { cursor } : {}) })
  return json<RunPage>(await fetchImpl(`/api/runs?${query}`))
}

export async function fetchRun(
  threadId: string,
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): Promise<RunDetail> {
  return json<RunDetail>(await fetchImpl(`/api/runs/${encodeURIComponent(threadId)}`))
}

/** Each turn back as a user message and an assistant message with its run events. */
export function toMessages(run: RunDetail): UIMessage[] {
  return run.history.flatMap((turn, index): UIMessage[] => [
    { id: `${run.thread_id}-u${index}`, role: 'user', parts: [{ type: 'text', text: turn.brief }] },
    {
      id: `${run.thread_id}-a${index}`,
      role: 'assistant',
      parts: [
        ...turn.events.map((data) => ({ type: 'data-run-event' as const, data })),
        ...(turn.answer
          ? [{ type: 'text' as const, text: turn.answer, state: 'done' as const }]
          : []),
      ],
    },
  ])
}

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

/** An absolute date: a relative one ("il y a 2 h") goes stale on screen. */
export function runDate(iso: string): string {
  return DATE.format(new Date(iso))
}
