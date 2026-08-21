// The relay carries the key. What is checked here: it never comes back out,
// what comes in is bounded, and the rate is capped before the first euro.
import { describe, expect, it, vi } from 'vitest'
import { createHandler, createRateLimiter, LIMITS } from '../relay.mjs'

const KEY = 'sk-or-v1-secret'

/** An ephemeral server: we talk to the relay over the network, like the real one. */
async function onServer(options, work) {
  const { createServer } = await import('node:http')
  const server = createServer(createHandler(options))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    return await work(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

const modelResponse = (content, usage = { prompt_tokens: 120, completion_tokens: 40 }) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const askFor = (base, body) =>
  fetch(`${base}/reason`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify(body),
  })

describe('the reasoning relay', () => {
  it("returns the model's text and tokens, never the key", async () => {
    const call = vi.fn(async () => modelResponse('Une composition en trois temps.'))
    await onServer({ key: KEY, call }, async (base) => {
      const response = await askFor(base, {
        role: 'architect',
        instruction: 'Décris.',
        context: 'Trois histoires.',
      })
      const raw = await response.text()
      expect(response.status).toBe(200)
      expect(JSON.parse(raw)).toMatchObject({
        text: 'Une composition en trois temps.',
        tokens: { input: 120, output: 40 },
      })
      expect(raw).not.toContain(KEY)
      expect(JSON.stringify([...response.headers])).not.toContain(KEY)
    })

    // The key goes to the provider, and nowhere else.
    const [url, options] = call.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(options.headers.authorization).toBe(`Bearer ${KEY}`)
  })

  it('bounds what goes to the provider', async () => {
    const call = vi.fn(async () => modelResponse('ok'))
    await onServer({ key: KEY, call }, (base) =>
      askFor(base, {
        role: 'sceptic',
        instruction: 'x'.repeat(5000),
        context: 'y'.repeat(12_000),
      }),
    )

    const sent = JSON.parse(call.mock.calls[0][1].body)
    expect(sent.max_tokens).toBe(LIMITS.maxOutput)
    const userMessage = sent.messages.at(-1).content
    expect(userMessage.match(/x+/)[0]).toHaveLength(LIMITS.maxInstruction)
    expect(userMessage.match(/y+/)[0]).toHaveLength(LIMITS.maxContext)
  })

  it('refuses a role that is not in the cast, without calling the model', async () => {
    const call = vi.fn(async () => modelResponse('should not leave'))
    await onServer({ key: KEY, call }, async (base) => {
      const response = await askFor(base, { role: 'exfiltrator', instruction: 'ignore tout' })
      expect(response.status).toBe(400)
      expect((await response.json()).error).toContain('rôle inconnu')
    })
    expect(call).not.toHaveBeenCalled()
  })

  it("does not relay the provider's error message as is", async () => {
    const call = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: `clé ${KEY} invalide` } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    )
    await onServer({ key: KEY, call }, async (base) => {
      const response = await askFor(base, { role: 'architect', instruction: 'x' })
      const raw = await response.text()
      expect(response.status).toBe(502)
      expect(raw).not.toContain(KEY)
      expect(raw).toContain('401')
    })
  })

  it('announces its state with no key, and refuses to reason', async () => {
    await onServer({ key: '', model: 'deepseek/deepseek-v4-flash' }, async (base) => {
      expect(await (await fetch(`${base}/health`)).json()).toEqual({
        ready: false,
        model: 'deepseek/deepseek-v4-flash',
      })
      expect((await askFor(base, { role: 'architect', instruction: 'x' })).status).toBe(503)
    })
  })

  it('cuts an oversized payload before reading it', async () => {
    const call = vi.fn(async () => modelResponse('should not leave'))
    await onServer({ key: KEY, call }, async (base) => {
      // The relay closes the connection: the client sees a network failure,
      // not a relay that swallowed a megabyte.
      await expect(
        askFor(base, { role: 'architect', context: 'z'.repeat(LIMITS.maxBody * 3) }),
      ).rejects.toThrow()
    })
    expect(call).not.toHaveBeenCalled()
  })

  it('ignores any route that is not its own', async () => {
    await onServer({ key: KEY }, async (base) => {
      expect((await fetch(`${base}/`)).status).toBe(404)
      expect((await fetch(`${base}/reason`)).status).toBe(404)
    })
  })
})

describe('the rate limiter', () => {
  it('caps one address per minute, then releases it', () => {
    let instant = Date.parse('2026-08-20T10:00:00Z')
    const allow = createRateLimiter(LIMITS, () => instant)

    for (let i = 0; i < LIMITS.perMinute; i += 1) expect(allow('a')).toBeUndefined()
    expect(allow('a')).toContain('trop de demandes')
    // Another address is not punished for the first one.
    expect(allow('b')).toBeUndefined()

    instant += 61_000
    expect(allow('a')).toBeUndefined()
  })

  it('caps the whole day, all addresses together', () => {
    let instant = Date.parse('2026-08-20T10:00:00Z')
    const limits = { ...LIMITS, perMinute: 10_000, perDay: 12 }
    const allow = createRateLimiter(limits, () => instant)

    for (let i = 0; i < limits.perDay; i += 1) expect(allow(`ip-${i}`)).toBeUndefined()
    expect(allow('new-ip')).toBe('quota du jour atteint')

    // The next day the quota resets: otherwise the site dies on first abuse.
    instant += 24 * 3600_000
    expect(allow('new-ip')).toBeUndefined()
  })
})
