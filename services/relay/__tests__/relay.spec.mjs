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
      const health = await (await fetch(`${base}/health`)).json()
      expect(health.ready).toBe(false)
      expect(health.model).toBe('deepseek/deepseek-v4-flash')
      // The page reads what is left before offering to launch: a capacity
      // discovered on the fortieth call is discovered too late.
      expect(health.remaining.visitor).toBeGreaterThan(0)
      expect(health.remaining.global).toBeGreaterThan(0)
      expect(health.callsPerRun).toBeGreaterThan(0)
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

// Le vocabulaire d'actions voyage par le tool calling : le nom de l'action y
// passe hors du corps JSON, ce qui la met à l'abri du fournisseur qui sérialise
// les clés par ordre alphabétique. Sans ces deux moitiés — les outils qui
// montent, les appels qui redescendent — la page retombe sur le JSON dans le
// texte et échoue au parse. Mesuré en production le 2026-09-07 :
// « Réponse illisible : Expected property name or '}' in JSON at position 1 ».
describe('the relay and the tool vocabulary', () => {
  const TOOLS = [
    {
      type: 'function',
      function: { name: 'create', description: 'Crée un composant.', parameters: {} },
    },
  ]

  it('carries the caller vocabulary to the provider, and requires an action', async () => {
    const call = vi.fn(async () => modelResponse('fait'))
    await onServer({ key: KEY, call }, async (base) => {
      await askFor(base, {
        role: 'agent',
        instruction: 'Agis.',
        context: 'rien',
        tools: TOOLS,
      })
    })

    const sent = JSON.parse(call.mock.calls[0][1].body)
    expect(sent.tools).toEqual(TOOLS)
    // Un tour sans action est un tour perdu : l'agent a dépensé un appel pour
    // dire quelque chose et n'a rien fait.
    expect(sent.tool_choice).toBe('required')
  })

  it('sends no tool key at all when the caller describes none', async () => {
    const call = vi.fn(async () => modelResponse('fait'))
    await onServer({ key: KEY, call }, async (base) => {
      await askFor(base, { role: 'agent', instruction: 'Agis.', context: 'rien' })
    })

    const sent = JSON.parse(call.mock.calls[0][1].body)
    expect('tools' in sent).toBe(false)
    expect('tool_choice' in sent).toBe(false)
  })

  it('hands the tool calls back to the page', async () => {
    const call = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    { function: { name: 'create', arguments: '{"name":"compteur"}' } },
                    { function: { name: 'say', arguments: '' } },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )

    await onServer({ key: KEY, call }, async (base) => {
      const response = await askFor(base, {
        role: 'agent',
        instruction: 'Agis.',
        context: 'rien',
        tools: TOOLS,
      })
      const body = await response.json()
      expect(body.calls).toEqual([
        { name: 'create', arguments: '{"name":"compteur"}' },
        { name: 'say', arguments: '' },
      ])
    })
  })

  it('reads the provider as a hostile source', async () => {
    const call = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: 'fait',
                  tool_calls: [
                    'pas un objet',
                    { function: null },
                    { function: { name: '' } },
                    { function: { name: 'create', arguments: { pas: 'une chaîne' } } },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )

    await onServer({ key: KEY, call }, async (base) => {
      const response = await askFor(base, { role: 'agent', instruction: 'Agis.', context: 'x' })
      const body = await response.json()
      // Seul l'appel nommé survit, et ses arguments deviennent une chaîne vide
      // plutôt qu'un objet que la page n'attend pas.
      expect(body.calls).toEqual([{ name: 'create', arguments: '' }])
    })
  })

  it('lets the body bound refuse a vocabulary too large to be one', async () => {
    const call = vi.fn(async () => modelResponse('fait'))
    await onServer({ key: KEY, call }, async (base) => {
      // Le corps est coupé avant d'être lu : une borne propre au vocabulaire
      // ne pourrait jamais se déclencher derrière celle-ci.
      await expect(
        askFor(base, {
          role: 'agent',
          instruction: 'Agis.',
          context: 'x',
          tools: [{ description: 'x'.repeat(LIMITS.maxBody) }],
        }),
      ).rejects.toThrow()
      expect(call).not.toHaveBeenCalled()
    })
  })

  it('accepts a turn made of calls alone, with no text', async () => {
    const call = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'length',
                message: { content: '', tool_calls: [{ function: { name: 'create' } }] },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )

    await onServer({ key: KEY, call }, async (base) => {
      const response = await askFor(base, { role: 'agent', instruction: 'Agis.', context: 'x' })
      // Un modèle qui agit n'a rien à dire en plus : couper sur l'absence de
      // texte rejetterait un tour valide.
      expect(response.status).toBe(200)
      expect((await response.json()).calls).toHaveLength(1)
    })
  })

  it('says when the provider cut the output at its budget', async () => {
    const call = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'length', message: { content: 'une phrase qui ne' } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )

    await onServer({ key: KEY, call }, async (base) => {
      const body = await (
        await askFor(base, { role: 'agent', instruction: 'Agis.', context: 'x' })
      ).json()
      // Le texte seul ne dit pas qu'il est coupé : sans ce champ, l'appelant
      // publierait une phrase inachevée sans pouvoir le savoir.
      expect(body.truncated).toBe(true)
    })
  })

  it('says nothing about truncation when the model finished', async () => {
    const call = vi.fn(async () => modelResponse('fait'))
    await onServer({ key: KEY, call }, async (base) => {
      const body = await (
        await askFor(base, { role: 'agent', instruction: 'Agis.', context: 'x' })
      ).json()
      expect(body.truncated).toBeUndefined()
    })
  })
})

describe('the rate limiter', () => {
  it('caps one address per minute, then releases it', () => {
    let instant = Date.parse('2026-08-20T10:00:00Z')
    const allow = createRateLimiter(LIMITS, () => instant)

    for (let i = 0; i < LIMITS.perMinute; i += 1) expect(allow('a')).toBeUndefined()
    // Ten seconds later, still inside the same minute.
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
    expect(allow('new-ip')).toBe('capacité du jour atteinte pour le site')

    // The next day the quota resets: otherwise the site dies on first abuse.
    instant += 24 * 3600_000
    expect(allow('new-ip')).toBeUndefined()
  })

  it('stops one visitor from taking the day, and spares the others', () => {
    let instant = Date.parse('2026-08-20T10:00:00Z')
    const limits = { ...LIMITS, perMinute: 10_000, perDay: 1000, perVisitorPerDay: 5 }
    const allow = createRateLimiter(limits, () => instant)

    for (let i = 0; i < limits.perVisitorPerDay; i += 1) expect(allow('greedy')).toBeUndefined()
    expect(allow('greedy')).toBe('capacité du jour atteinte pour vous')
    // The whole point: the site is not out of capacity, this visitor is.
    expect(allow('someone-else')).toBeUndefined()

    instant += 24 * 3600_000
    expect(allow('greedy')).toBeUndefined()
  })

  it('says what is left without consuming any of it', () => {
    const instant = Date.parse('2026-08-20T10:00:00Z')
    const limits = { ...LIMITS, perDay: 100, perVisitorPerDay: 10 }
    const allow = createRateLimiter(limits, () => instant)

    expect(allow.remaining('a')).toEqual({ visitor: 10, global: 100 })
    // Reading twice must not cost anything: the page reads before every run.
    expect(allow.remaining('a')).toEqual({ visitor: 10, global: 100 })

    allow('a')
    expect(allow.remaining('a')).toEqual({ visitor: 9, global: 99 })
    // Another visitor's remaining is their own, and the global is shared.
    expect(allow.remaining('b')).toEqual({ visitor: 10, global: 99 })
  })
})
