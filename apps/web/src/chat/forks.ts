/**
 * Forking a run from one of its checkpoints (MEM-23), and swapping the
 * specialist on the branch (MEM-33). Shapes mirror services/api/openapi.json.
 *
 * The fork answers with the same UI message stream as a chat (MEM-14): the
 * branch runs while it streams. This module waits for the end of that stream
 * and returns the branch id announced in its first event, because the screen
 * then opens the branch as a run like any other.
 */
import { nodeName } from '../run/names'

export interface Checkpoint {
  checkpoint_id: string
  step: number | null
  source: string | null
  /** The nodes still to run from here; empty means the run is over. */
  next: string[]
}

export interface SpecialistIdentity {
  name: string
  framework: string
  framework_version: string
}

export interface Specialist {
  name: string
  identity: SpecialistIdentity
}

export interface ForkChoice {
  checkpointId?: string
  specialist?: string
}

type Fetch = typeof fetch

const call: Fetch = (...args) => globalThis.fetch(...args)

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Le service a répondu ${response.status}.`)
  return (await response.json()) as T
}

export async function fetchCheckpoints(
  threadId: string,
  fetchImpl: Fetch = call,
): Promise<Checkpoint[]> {
  return json<Checkpoint[]>(
    await fetchImpl(`/api/runs/${encodeURIComponent(threadId)}/checkpoints`),
  )
}

export async function fetchSpecialists(fetchImpl: Fetch = call): Promise<Specialist[]> {
  const body = await json<{ items: Specialist[] }>(await fetchImpl('/api/specialists'))
  return body.items
}

/** The branch id, once the branch has finished running. */
export async function forkRun(
  threadId: string,
  choice: ForkChoice,
  fetchImpl: Fetch = call,
): Promise<string> {
  const body: Record<string, string> = {}
  if (choice.checkpointId) body.checkpoint_id = choice.checkpointId
  if (choice.specialist) body.specialist = choice.specialist

  const response = await fetchImpl(`/api/runs/${encodeURIComponent(threadId)}/fork`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    // The service answers JSON before the stream starts when it refuses.
    const detail = (await response.json().catch(() => null)) as { detail?: string } | null
    throw new Error(detail?.detail ?? `Le service a répondu ${response.status}.`)
  }
  const text = await response.text()
  return branchOf(text)
}

/** The branch id, from the first `start` event of the stream. */
export function branchOf(stream: string): string {
  for (const line of stream.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const payload = JSON.parse(line.slice(6)) as {
      type?: string
      messageMetadata?: { threadId?: string }
    }
    if (payload.type === 'start' && payload.messageMetadata?.threadId) {
      return payload.messageMetadata.threadId
    }
  }
  throw new Error("Le service n'a pas annoncé de branche.")
}

/** What a checkpoint looks like in a list: where it sits, and what it would run. */
export function checkpointLabel(checkpoint: Checkpoint): string {
  // The input checkpoint sits at step -1: it is the entry point, not "step 0".
  if (checkpoint.source === 'input' || checkpoint.step === -1) return "Point d'entrée"
  const where = `Étape ${checkpoint.step === null ? '?' : checkpoint.step + 1}`
  if (checkpoint.next.length === 0) return `${where}, fin du run`
  return `${where}, avant : ${checkpoint.next.map(nodeName).join(', ')}`
}

export function isForkable(checkpoint: Checkpoint): boolean {
  return checkpoint.next.length > 0
}
