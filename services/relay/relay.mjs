// Reasoning relay. It exists for one reason: to keep the OpenRouter key
// server-side. A key in a client bundle is read in the network tab and drained.
//
// No dependency: Node alone. What comes in is bounded, what goes out is
// bounded, and the rate is limited per address. The module does not listen by
// itself — `server.mjs` does that — so it stays testable.

import { createServer } from 'node:http'

/** Hard bounds. A visitor cannot make the bill drift. */
export const LIMITS = {
  maxContext: 4000,
  maxInstruction: 500,
  maxBody: 20_000,
  maxOutput: 400,
  perMinute: 6,
  perDay: 300,
}

/** Only these roles may ask to reason. */
export const ROLES = new Set(['planner', 'architect', 'sceptic', 'agent', 'master-agent'])

const SYSTEM_PROMPT =
  "Tu es un agent d'une chaîne de production logicielle. Réponds en français, " +
  'en texte brut, sans préambule, sans titre, sans liste à puces. Trois phrases au plus.'

/**
 * The rate counter. Per address for the minute, global for the day: the second
 * bound is the one that protects the bill.
 */
export function createRateLimiter(limits = LIMITS, clock = () => Date.now()) {
  const hits = new Map()
  let day = { date: '', total: 0 }

  return function allow(address) {
    const now = clock()
    const date = new Date(now).toISOString().slice(0, 10)
    if (date !== day.date) day = { date, total: 0 }
    if (day.total >= limits.perDay) return 'quota du jour atteint'

    const recent = (hits.get(address) ?? []).filter((t) => now - t < 60_000)
    if (recent.length >= limits.perMinute) return 'trop de demandes, réessayez dans une minute'
    recent.push(now)
    hits.set(address, recent)
    day.total += 1
    return undefined
  }
}

const readBody = (request, maximum) =>
  new Promise((resolve, reject) => {
    let data = ''
    request.on('data', (chunk) => {
      data += chunk
      // Cut before reading: an oversized payload must not be able to occupy
      // the relay's memory.
      if (data.length > maximum) {
        reject(new Error('charge utile trop grande'))
        request.destroy()
      }
    })
    request.on('end', () => resolve(data))
    request.on('error', reject)
  })

/**
 * The request handler. `call` is injectable: tests never reach the network,
 * and the provider stays replaceable.
 */
export function createHandler({
  key = '',
  model = 'anthropic/claude-3.5-haiku',
  origin = 'https://usine.memolabs.dev',
  call = globalThis.fetch,
  limits = LIMITS,
  allow = createRateLimiter(limits),
} = {}) {
  const json = (response, code, body) => {
    response.writeHead(code, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    })
    response.end(JSON.stringify(body))
  }

  return async function handle(request, response) {
    if (request.method === 'OPTIONS') return json(response, 204, {})
    const path = (request.url ?? '').split('?')[0]

    if (path === '/health') {
      // `ready` says whether there is a key, never which one: this is what the
      // browser reads to pick its mode.
      return json(response, 200, { ready: key.length > 0, model })
    }
    if (request.method !== 'POST' || path !== '/reason') {
      return json(response, 404, { error: 'route inconnue' })
    }
    if (key.length === 0) {
      return json(response, 503, { error: 'aucune clé configurée sur le relais' })
    }

    let body
    try {
      body = JSON.parse(await readBody(request, limits.maxBody))
    } catch (cause) {
      return json(response, 400, { error: cause instanceof Error ? cause.message : String(cause) })
    }

    // The role is validated before the counter: a malformed request must not
    // consume legitimate visitors' quota.
    const role = String(body?.role ?? '')
    if (!ROLES.has(role)) return json(response, 400, { error: `rôle inconnu : ${role}` })

    const address = String(request.headers['x-forwarded-for'] ?? '')
      .split(',')[0]
      .trim()
    const refusal = allow(address.length > 0 ? address : (request.socket?.remoteAddress ?? '?'))
    if (refusal !== undefined) return json(response, 429, { error: refusal })

    const instruction = String(body?.instruction ?? '').slice(0, limits.maxInstruction)
    const context = String(body?.context ?? '').slice(0, limits.maxContext)

    try {
      const upstream = await call('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          'http-referer': origin,
          'x-title': "L'usine agentique — Memo Labs",
        },
        body: JSON.stringify({
          model,
          max_tokens: limits.maxOutput,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Rôle : ${role}\nTâche : ${instruction}\n\nContexte :\n${context}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      })

      const result = await upstream.json()
      if (!upstream.ok) {
        // The provider's message can contain anything: it does not go back out
        // as is, only its status is public.
        return json(response, 502, { error: `le modèle a refusé (${upstream.status})` })
      }

      const text = String(result?.choices?.[0]?.message?.content ?? '').trim()
      const usage = result?.usage ?? {}
      return json(response, 200, {
        text,
        model: result?.model ?? model,
        tokens: {
          input: Number(usage.prompt_tokens ?? 0),
          output: Number(usage.completion_tokens ?? 0),
        },
      })
    } catch (cause) {
      return json(response, 502, {
        error: cause instanceof Error ? cause.message : 'appel au modèle impossible',
      })
    }
  }
}

export const createRelay = (options) => createServer(createHandler(options))
