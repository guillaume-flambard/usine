// The reasoner that goes through the server relay. This is the public site's
// one: the visitor supplies no key, and the key is never in the browser.
//
// Same port as the others. A relay that is absent, saturated or broken falls
// back to the written answer — the run reaches its end either way.

import type { Reasoner, Reasoning, ReasoningRequest, ToolCall } from './index'

export interface RelayOptions {
  /** Same origin by default: nginx forwards /api to the service. */
  endpoint?: string
  timeoutMs?: number
  fetchOverride?: typeof fetch
}

interface RelayResponse {
  text?: string
  calls?: { name?: unknown; arguments?: unknown }[]
  truncated?: unknown
  model?: string
  tokens?: { input: number; output: number }
  error?: string
}

export function relayReasoner(options: RelayOptions = {}): Reasoner {
  const endpoint = options.endpoint ?? '/api/reason'
  const call = options.fetchOverride ?? globalThis.fetch

  return {
    origin: 'llm',
    async reason(request: ReasoningRequest): Promise<Reasoning> {
      try {
        const response = await call(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            role: request.role,
            instruction: request.instruction,
            context: request.context,
            ...(request.tools !== undefined ? { tools: request.tools } : {}),
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        })

        const body = (await response.json()) as RelayResponse
        if (!response.ok || body.error !== undefined) {
          return {
            text: request.fallback,
            origin: 'llm',
            failure: body.error ?? `relais indisponible (${response.status})`,
          }
        }

        const calls = readCalls(body.calls)
        const text = (body.text ?? '').trim()
        // Des appels d'outils suffisent : un modèle qui agit n'a rien à dire
        // en plus, et exiger du texte rejetterait un tour valide.
        if (text.length === 0 && calls.length === 0) {
          return {
            text: request.fallback,
            origin: 'llm',
            failure: 'le modèle a répondu sans texte',
            ...(body.tokens !== undefined ? { tokens: body.tokens } : {}),
          }
        }

        return {
          text,
          origin: 'llm',
          ...(calls.length > 0 ? { calls } : {}),
          ...(body.tokens !== undefined ? { tokens: body.tokens } : {}),
          ...(body.truncated === true ? { truncated: true as const } : {}),
        }
      } catch (cause) {
        return {
          text: request.fallback,
          origin: 'llm',
          failure: cause instanceof Error ? cause.message : 'relais injoignable',
        }
      }
    },
  }
}

/** Relit les appels d'outils. Ce qui vient du réseau est une donnée hostile. */
function readCalls(raw: RelayResponse['calls']): ToolCall[] {
  if (!Array.isArray(raw)) return []
  const calls: ToolCall[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const name = typeof entry.name === 'string' ? entry.name : ''
    const args = typeof entry.arguments === 'string' ? entry.arguments : ''
    if (name.length > 0) calls.push({ name, arguments: args })
  }
  return calls
}

/** What the page needs to know before offering to launch anything. */
export interface RelayState {
  /** A key is configured and the relay answers. */
  ready: boolean
  /** Runs still available, for this visitor and for the site. */
  runs: { visitor: number; site: number }
}

const UNAVAILABLE: RelayState = { ready: false, runs: { visitor: 0, site: 0 } }

/**
 * Asks the relay for its state and its remaining capacity.
 *
 * Capacity is converted from calls into **runs** here rather than shown raw:
 * "37 calls left" means nothing to a visitor, and the conversion rate is the
 * relay's business, so the relay is the one that reports it.
 */
export async function relayState(
  endpoint = '/api/health',
  call: typeof fetch = globalThis.fetch,
): Promise<RelayState> {
  try {
    const response = await call(endpoint, { signal: AbortSignal.timeout(4000) })
    if (!response.ok) return UNAVAILABLE
    const body = (await response.json()) as {
      ready?: boolean
      remaining?: { visitor?: number; global?: number }
      callsPerRun?: number
    }
    if (body.ready !== true) return UNAVAILABLE

    const perRun = typeof body.callsPerRun === 'number' && body.callsPerRun > 0
      ? body.callsPerRun
      : 45
    const runs = (calls: unknown): number =>
      typeof calls === 'number' && calls > 0 ? Math.floor(calls / perRun) : 0

    return {
      ready: true,
      runs: { visitor: runs(body.remaining?.visitor), site: runs(body.remaining?.global) },
    }
  } catch {
    return UNAVAILABLE
  }
}

/**
 * Is a live run possible right now? Ready *and* with capacity — a relay that
 * holds a key but has nothing left would send the visitor into a run that
 * dies on its third agent, which is worse than replaying honestly.
 */
export async function relayAvailable(
  endpoint = '/api/health',
  call: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  const state = await relayState(endpoint, call)
  return state.ready && state.runs.visitor > 0 && state.runs.site > 0
}
