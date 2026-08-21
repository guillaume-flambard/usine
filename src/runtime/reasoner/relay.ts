// The reasoner that goes through the server relay. This is the public site's
// one: the visitor supplies no key, and the key is never in the browser.
//
// Same port as the others. A relay that is absent, saturated or broken falls
// back to the written answer — the run reaches its end either way.

import type { Reasoner, Reasoning, ReasoningRequest } from './index'

export interface RelayOptions {
  /** Same origin by default: nginx forwards /api to the service. */
  endpoint?: string
  timeoutMs?: number
  fetchOverride?: typeof fetch
}

interface RelayResponse {
  text?: string
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

        const text = (body.text ?? '').trim()
        if (text.length === 0) {
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
          ...(body.tokens !== undefined ? { tokens: body.tokens } : {}),
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

/** Is the relay configured and reachable? Used to pick the mode at startup. */
export async function relayAvailable(
  endpoint = '/api/health',
  call: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  try {
    const response = await call(endpoint, { signal: AbortSignal.timeout(4000) })
    if (!response.ok) return false
    const body = (await response.json()) as { ready?: boolean }
    return body.ready === true
  } catch {
    return false
  }
}
