// Reasoning relay. It exists for one reason: to keep the OpenRouter key
// server-side. A key in a client bundle is read in the network tab and drained.
//
// No dependency: Node alone. What comes in is bounded, what goes out is
// bounded, and the rate is limited per address. The module does not listen by
// itself — `server.mjs` does that — so it stays testable.

import { createServer } from 'node:http'

/** Hard bounds. A visitor cannot make the bill drift. */
export const LIMITS = {
  maxContext: 6000,
  maxInstruction: 1200,
  maxBody: 20_000,
  // An agent turn is JSON and can carry a tool's source: 400 tokens truncated
  // it mid-code, and a truncated turn is an unreadable turn.
  maxOutput: 1200,
  // A single run makes a dozen calls in under a minute — one per agent turn,
  // plus the answers. Six per minute refused most of a legitimate run.
  perMinute: 40,
  perDay: 400,
}

/** Only these roles may ask to reason. */
export const ROLES = new Set(['planner', 'architect', 'sceptic', 'agent', 'master-agent'])

// Deliberately minimal: the caller's instruction carries the format — often
// a strict JSON object. A system prompt demanding "plain text, three
// sentences" fought it, and every agent turn came back unreadable.
const SYSTEM_PROMPT =
  "Tu es un agent d'une chaîne de production logicielle. Réponds en français. " +
  "Suis exactement le format que l'instruction demande, sans préambule ni commentaire autour."

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
  model = 'deepseek/deepseek-v4-flash',
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
          // ASCII only: an HTTP header is a ByteString, an em dash throws.
          'x-title': 'Usine agentique - Memo Labs',
        },
        body: JSON.stringify({
          model,
          max_tokens: limits.maxOutput,
          // Reasoning off, deliberately. A reasoning model spends the whole
          // output budget thinking and returns empty content: measured, two
          // calls out of three came back with 1200 reasoning tokens and not
          // one character. What is asked here is a JSON object in a fixed
          // shape, not a deliberation.
          reasoning: { enabled: false },
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

      const choice = result?.choices?.[0]
      const text = String(choice?.message?.content ?? '').trim()
      const usage = result?.usage ?? {}
      // An empty answer has a cause, and the cause is worth more than the
      // silence: a model cut off mid-output is not a model that had nothing
      // to say.
      if (text.length === 0 && choice?.finish_reason === 'length') {
        return json(response, 502, {
          error: `réponse coupée à ${limits.maxOutput} tokens sans texte utile`,
        })
      }
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
