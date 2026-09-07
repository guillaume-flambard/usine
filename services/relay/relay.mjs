// Reasoning relay — **gelé, sauf sur le contrat qu'il doit tenir**.
//
// Ce fichier sert la production actuelle (conteneur unique, nginx + node) et
// rien d'autre. Le service qui le remplace est `services/api`, en FastAPI, au
// contrat HTTP identique ; il porte en plus la persistance des runs, la
// mémoire, les sources, MCP, l'évaluation et les traces.
//
// **Ne rien lui ajouter.** Toute fonctionnalité va dans `services/api` ; ce
// fichier disparaît au basculement des trois conteneurs (histoire 10.3).
//
// Le gel a une exception, et elle a été payée : deux relais au même contrat
// ont divergé, et la divergence s'est découverte en production le 2026-09-07.
// La page envoyait un vocabulaire d'outils et attendait des appels ; celui-ci
// ignorait les deux. Chaque tour retombait donc sur le JSON dans le texte et
// échouait au parse — « Expected property name or '}' in JSON at position 1 »,
// sur un site public. **Tant qu'il sert la production, il tient le contrat**,
// et ce qu'il en tient est testé à côté de celui de `services/api`.
//
// It exists for one reason: to keep the OpenRouter key
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
  // A run costs roughly forty calls. Two runs per visitor and per day is the
  // whole point of this bound: without it the day's capacity belongs to
  // whoever arrives first, and everyone after them sees a dead page.
  perVisitorPerDay: 90,
  // Raised with the per-visitor bound in place: the global cap no longer has
  // to do the work of protecting the site from a single curious visitor.
  perDay: 4_000,
}

/** Only these roles may ask to reason. */
export const ROLES = new Set(['planner', 'architect', 'sceptic', 'agent', 'master-agent'])

// Deliberately minimal: the caller's instruction carries the format — often
// a strict JSON object. A system prompt demanding "plain text, three
// sentences" fought it, and every agent turn came back unreadable.
/**
 * Relit les appels d'outils. Le fournisseur est une source hostile : tout ce
 * qui n'est pas un appel nommé est écarté, et des arguments qui ne sont pas
 * une chaîne deviennent une chaîne vide plutôt qu'une forme que la page
 * n'attend pas. Même lecture que `_tool_calls` de `services/api`.
 */
export function toolCalls(message) {
  const raw = message?.tool_calls
  if (!Array.isArray(raw)) return []
  const calls = []
  for (const entry of raw) {
    const name = entry?.function?.name
    if (typeof name !== 'string' || name.length === 0) continue
    const args = entry.function.arguments
    calls.push({ name, arguments: typeof args === 'string' ? args : '' })
  }
  return calls
}

const SYSTEM_PROMPT =
  "Tu es un agent d'une chaîne de production logicielle. Réponds en français. " +
  "Suis exactement le format que l'instruction demande, sans préambule ni commentaire autour."

/**
 * The rate counter. Per address for the minute, global for the day: the second
 * bound is the one that protects the bill.
 */
export function createRateLimiter(limits = LIMITS, clock = () => Date.now()) {
  const hits = new Map()
  let day = { date: '', total: 0, perVisitor: new Map() }

  /** Rolls the day over. Yesterday's counters are not carried, nor kept. */
  const today = (now) => {
    const date = new Date(now).toISOString().slice(0, 10)
    if (date !== day.date) day = { date, total: 0, perVisitor: new Map() }
    return day
  }

  /** What is left, without consuming anything. The page reads this. */
  function remaining(address) {
    const current = today(clock())
    const spent = current.perVisitor.get(address) ?? 0
    return {
      visitor: Math.max(0, limits.perVisitorPerDay - spent),
      global: Math.max(0, limits.perDay - current.total),
    }
  }

  function allow(address) {
    const now = clock()
    const current = today(now)
    if (current.total >= limits.perDay) return 'capacité du jour atteinte pour le site'

    const spent = current.perVisitor.get(address) ?? 0
    if (spent >= limits.perVisitorPerDay) return 'capacité du jour atteinte pour vous'

    const recent = (hits.get(address) ?? []).filter((t) => now - t < 60_000)
    if (recent.length >= limits.perMinute) return 'trop de demandes, réessayez dans une minute'
    recent.push(now)
    hits.set(address, recent)
    current.total += 1
    current.perVisitor.set(address, spent + 1)
    return undefined
  }

  allow.remaining = remaining
  return allow
}

/**
 * Who is asking. nginx forwards the visitor's address; without it the relay
 * would see one address for the whole planet and every per-visitor bound
 * would be shared by everyone.
 */
const addressOf = (request) => {
  const forwarded = String(request.headers['x-forwarded-for'] ?? '')
    .split(',')[0]
    .trim()
  return forwarded.length > 0 ? forwarded : (request.socket?.remoteAddress ?? '?')
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
      // browser reads to pick its mode. `remaining` is what it reads to say so
      // honestly before the visitor clicks — a capacity discovered on the
      // fortieth call is a capacity discovered too late.
      const left = allow.remaining(addressOf(request))
      return json(response, 200, {
        ready: key.length > 0,
        model,
        remaining: left,
        // A run's rough cost, so the page can turn calls into runs without
        // hard-coding a number that would drift from the budgets.
        callsPerRun: 45,
      })
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

    const refusal = allow(addressOf(request))
    if (refusal !== undefined) return json(response, 429, { error: refusal })

    const instruction = String(body?.instruction ?? '').slice(0, limits.maxInstruction)
    const context = String(body?.context ?? '').slice(0, limits.maxContext)
    // Pas de borne propre au vocabulaire : ici, `maxBody` la subsume. Un corps
    // de plus de 20 000 octets est refusé avant d'être lu, et `JSON.stringify`
    // n'échappe pas les caractères non-ASCII, donc le vocabulaire re-sérialisé
    // ne pèse jamais beaucoup plus que ce qui est arrivé.
    //
    // `services/api` en déclare une, et elle y sert : `json.dumps` échappe par
    // défaut le non-ASCII en six caractères pour un, si bien qu'un vocabulaire
    // écrit en français peut passer la borne de corps et dépasser celle des
    // outils. Les deux services diffèrent ici parce que leurs sérialiseurs
    // diffèrent, pas par négligence.
    const tools = body?.tools

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
          // Le vocabulaire vient de l'appelant : il le décrit, et le relais
          // n'en tient pas une seconde copie qui dériverait. Il le borne, et
          // c'est tout. `tool_choice: required` parce qu'un tour sans action
          // est un tour perdu — l'agent a dépensé un appel pour dire quelque
          // chose et n'a rien fait.
          ...(tools !== undefined ? { tools, tool_choice: 'required' } : {}),
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
      const calls = toolCalls(choice?.message)
      const usage = result?.usage ?? {}
      // An empty answer has a cause, and the cause is worth more than the
      // silence: a model cut off mid-output is not a model that had nothing
      // to say.
      // Un modèle qui agit n'a rien à dire en plus : exiger du texte
      // rejetterait un tour valide fait d'appels seuls.
      if (text.length === 0 && calls.length === 0 && choice?.finish_reason === 'length') {
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
        ...(calls.length > 0 ? { calls } : {}),
      })
    } catch (cause) {
      return json(response, 502, {
        error: cause instanceof Error ? cause.message : 'appel au modèle impossible',
      })
    }
  }
}

export const createRelay = (options) => createServer(createHandler(options))
