/**
 * The runs API (MEM-18) seen from the web: list, open, and turn a run back into
 * the messages `useChat` shows. Shapes mirror services/api/openapi.json.
 */
import type { UIMessage } from 'ai'
import type { RunEventPayload } from '../contracts/ui-stream'

export interface RunSummary {
  thread_id: string
  title: string
  status: 'running' | 'waiting' | 'deciding' | 'done' | 'error'
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

const DECISION_TEXT: Record<string, string> = {
  approve: 'Décision : approuver.',
  reject: 'Décision : rejeter.',
  edit: 'Décision : approuver la version modifiée.',
}

/**
 * The decision a turn carries, when the turn is the gate's answer rather than a
 * new brief: the service resumes the same run (`run-started` with `resumed`).
 */
function decisionOf(turn: RunTurn): string | undefined {
  if (turn.events[0]?.kind !== 'run-started' || turn.events[0]?.data?.resumed !== true) return
  const decided = turn.events.find((event) => event.kind === 'gate-decided')
  return String(decided?.data?.decision ?? 'decided')
}

/**
 * Each turn back as a user message and an assistant message with its run events.
 * A gate decision comes back as a decision, not as a second brief: otherwise a
 * reopened run showed only its last turn, the gate alone (16 November 2026).
 */
export function toMessages(run: RunDetail): UIMessage[] {
  return run.history.flatMap((turn, index): UIMessage[] => [
    userMessage(`${run.thread_id}-u${index}`, turn),
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

function userMessage(id: string, turn: RunTurn): UIMessage {
  const decision = decisionOf(turn)
  if (decision === undefined)
    return { id, role: 'user', parts: [{ type: 'text', text: turn.brief }] }
  return {
    id,
    role: 'user',
    metadata: { gate: decision },
    parts: [{ type: 'text', text: DECISION_TEXT[decision] ?? 'Décision prise.' }],
  }
}

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

/** An absolute date: a relative one ("il y a 2 h") goes stale on screen. */
export function runDate(iso: string): string {
  return DATE.format(new Date(iso))
}
