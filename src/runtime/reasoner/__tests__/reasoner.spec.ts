// The reasoning port: the default never touches the network, and a model that
// fails does not break the run.
import { describe, expect, it, vi } from 'vitest'
import { deterministicReasoner, type Reasoner, type ReasoningRequest } from '../index'
import { claudeReasoner, DEFAULT_MODEL } from '../claude'

const REQUEST: ReasoningRequest = {
  role: 'architecte',
  instruction: 'Motive la composition.',
  context: 'Trois constructeurs.',
  fallback: 'La réponse écrite à la main.',
}

describe('deterministic reasoner', () => {
  it('returns the fallback, with no network and no tokens', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const reasoning = await deterministicReasoner().reason(REQUEST)

    expect(reasoning.text).toBe(REQUEST.fallback)
    expect(reasoning.origin).toBe('deterministic')
    expect(reasoning.tokens).toBeUndefined()
    // The frugality promise either holds or it does not: nothing leaves.
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

/** A fake HTTP route: the suite must never reach the real network. */
const fakeResponse = (body: unknown, status = 200): typeof fetch =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch

const MESSAGE = (text: string, stop = 'end_turn') => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5',
  content: text.length > 0 ? [{ type: 'text', text }] : [],
  stop_reason: stop,
  stop_sequence: null,
  usage: {
    input_tokens: 1000,
    output_tokens: 250,
    cache_read_input_tokens: 120,
    cache_creation_input_tokens: 30,
  },
})

describe('reasoner connected to a model', () => {
  it('names the default model rather than guessing it', () => {
    expect(DEFAULT_MODEL).toBe('claude-opus-5')
    expect(claudeReasoner({ key: 'test' }).origin).toBe('llm')
  })

  it("returns the model's text and counts the tokens actually billed", async () => {
    const reasoner = claudeReasoner({
      key: 'test-key',
      fetchOverride: fakeResponse(MESSAGE('Voici la composition retenue.')),
    })
    const reasoning = await reasoner.reason(REQUEST)

    expect(reasoning.text).toBe('Voici la composition retenue.')
    expect(reasoning.origin).toBe('llm')
    expect(reasoning.failure).toBeUndefined()
    // Input = fresh tokens + cache reads + cache writes. Counting only the
    // fresh input would under-report the real spend.
    expect(reasoning.tokens).toEqual({ input: 1000 + 120 + 30, output: 250 })
  })

  it('falls back when the model answers without text', async () => {
    const reasoner = claudeReasoner({
      key: 'test-key',
      fetchOverride: fakeResponse(MESSAGE('')),
    })
    const reasoning = await reasoner.reason(REQUEST)

    expect(reasoning.text).toBe(REQUEST.fallback)
    expect(reasoning.failure).toContain('sans texte')
    // The tokens were spent regardless: hiding them would be a lie.
    expect(reasoning.tokens?.output).toBe(250)
  })

  it('refuses a truncated answer rather than publishing it', async () => {
    const reasoner = claudeReasoner({
      key: 'test-key',
      fetchOverride: fakeResponse(MESSAGE('Trois constructeurs en par', 'max_tokens')),
    })
    const reasoning = await reasoner.reason(REQUEST)

    // A sentence cut mid-way is not an architect's decision.
    expect(reasoning.text).toBe(REQUEST.fallback)
    expect(reasoning.failure).toContain('tronquée')
  })

  it('falls back when the key is refused, without throwing', async () => {
    const reasoner: Reasoner = claudeReasoner({
      key: 'invalid-key',
      fetchOverride: fakeResponse(
        { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
        401,
      ),
    })
    const reasoning = await reasoner.reason(REQUEST)

    expect(reasoning.text).toBe(REQUEST.fallback)
    expect(reasoning.origin).toBe('llm')
    expect(reasoning.failure).toBeDefined()
    expect(reasoning.tokens).toBeUndefined()
  })

  it('never reaches the real network during the suite', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    await claudeReasoner({
      key: 'test-key',
      fetchOverride: fakeResponse(MESSAGE('ok')),
    }).reason(REQUEST)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
