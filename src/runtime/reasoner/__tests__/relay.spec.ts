// The relay is the only path by which the public site makes a model reason.
// What matters here: the key never travels through it, and no relay failure
// prevents a run from reaching its end.
import { describe, expect, it, vi } from 'vitest'
import { relayAvailable, relayState, relayReasoner } from '../relay'
import type { ReasoningRequest } from '../index'

const REQUEST: ReasoningRequest = {
  role: 'architecte',
  instruction: 'Décris la composition en deux phrases.',
  context: 'Trois histoires.',
  fallback: 'Trois constructeurs, un sceptique, une porte.',
}

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('the reasoner that goes through the relay', () => {
  it("returns the model's text and the tokens actually counted", async () => {
    const call = vi.fn(async () =>
      response({ text: '  Une composition en trois temps.  ', tokens: { input: 120, output: 40 } }),
    )
    const result = await relayReasoner({ fetchOverride: call }).reason(REQUEST)

    expect(result).toEqual({
      text: 'Une composition en trois temps.',
      origin: 'llm',
      tokens: { input: 120, output: 40 },
    })
    expect(result.failure).toBeUndefined()
  })

  it('carries the cut the relay reported, instead of hiding it in the text', async () => {
    const call = vi.fn(async () => response({ text: 'une phrase qui ne', truncated: true }))
    const result = await relayReasoner({ fetchOverride: call }).reason(REQUEST)

    // Le texte seul ne dit pas qu'il s'arrête au milieu : sans ce champ,
    // l'appelant publierait une phrase inachevée.
    expect(result.truncated).toBe(true)
  })

  it('says nothing about a cut when the model finished', async () => {
    const call = vi.fn(async () => response({ text: 'une phrase entière.' }))
    const result = await relayReasoner({ fetchOverride: call }).reason(REQUEST)

    expect(result.truncated).toBeUndefined()
  })

  it('sends neither a key nor the fallback to the server', async () => {
    const call = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) =>
      response({ text: 'ok' }),
    )
    await relayReasoner({ fetchOverride: call }).reason(REQUEST)

    const [url, options] = call.mock.calls[0] as [string, RequestInit]
    // Same origin: this is what allows `connect-src 'self'`.
    expect(url).toBe('/api/reason')
    const body = JSON.parse(String(options.body)) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['context', 'instruction', 'role'])
    expect(JSON.stringify(options.headers)).not.toMatch(/authorization|api-key/i)
  })

  it('falls back when the relay refuses, and says why', async () => {
    const call = vi.fn(async () => response({ error: 'quota du jour atteint' }, 429))
    const result = await relayReasoner({ fetchOverride: call }).reason(REQUEST)

    expect(result.text).toBe(REQUEST.fallback)
    expect(result.failure).toBe('quota du jour atteint')
  })

  it('falls back when the relay is unreachable', async () => {
    const call = vi.fn(async () => {
      throw new Error('Failed to fetch')
    })
    const result = await relayReasoner({ fetchOverride: call }).reason(REQUEST)

    expect(result.text).toBe(REQUEST.fallback)
    expect(result.failure).toBe('Failed to fetch')
  })

  it('refuses an empty answer rather than delivering blank', async () => {
    const call = vi.fn(async () => response({ text: '   ' }))
    const result = await relayReasoner({ fetchOverride: call }).reason(REQUEST)

    expect(result.text).toBe(REQUEST.fallback)
    expect(result.failure).toBe('le modèle a répondu sans texte')
  })
})

describe('the relay probe', () => {
  it('only reports the relay ready when it carries a key and has capacity', async () => {
    const ready = vi.fn(async () =>
      response({ ready: true, model: 'x', remaining: { visitor: 90, global: 4000 }, callsPerRun: 45 }),
    )
    const keyless = vi.fn(async () => response({ ready: false }))

    expect(await relayAvailable('/api/health', ready)).toBe(true)
    expect(await relayAvailable('/api/health', keyless)).toBe(false)
  })

  it('reports a keyed relay with nothing left as unavailable', async () => {
    // Sending a visitor into a run that dies on its third agent is worse than
    // replaying honestly. Capacity is part of availability, not a detail.
    const spent = vi.fn(async () =>
      response({ ready: true, remaining: { visitor: 3, global: 4000 }, callsPerRun: 45 }),
    )
    const siteSpent = vi.fn(async () =>
      response({ ready: true, remaining: { visitor: 90, global: 10 }, callsPerRun: 45 }),
    )

    expect(await relayAvailable('/api/health', spent)).toBe(false)
    expect(await relayAvailable('/api/health', siteSpent)).toBe(false)
  })

  it('reports what is left in runs, not in calls', async () => {
    const call = vi.fn(async () =>
      response({ ready: true, remaining: { visitor: 90, global: 900 }, callsPerRun: 45 }),
    )

    // A visitor reads runs. Calls are the relay's unit, not theirs.
    await expect(relayState('/api/health', call)).resolves.toEqual({
      ready: true,
      runs: { visitor: 2, site: 20 },
    })
  })

  it('returns false on 502, on an unreadable body, and on a network failure', async () => {
    const badGateway = vi.fn(async () => new Response('Bad Gateway', { status: 502 }))
    const unreadable = vi.fn(async () => new Response('<html>', { status: 200 }))
    const down = vi.fn(async () => {
      throw new Error('Failed to fetch')
    })

    expect(await relayAvailable('/api/health', badGateway)).toBe(false)
    expect(await relayAvailable('/api/health', unreadable)).toBe(false)
    expect(await relayAvailable('/api/health', down)).toBe(false)
  })
})
