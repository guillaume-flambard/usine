/**
 * The fork calls seen from the web (MEM-23, MEM-33): what the screen reads, and
 * what it sends. No browser needed for the shapes.
 */
import { describe, expect, it, vi } from 'vitest'
import { branchOf, checkpointLabel, forkRun, isForkable } from '../chat/forks'

const START = [
  'data: {"type": "start", "messageId": "a1", "messageMetadata": {"threadId": "branche-1"}}',
  '',
  'data: {"type": "finish", "finishReason": "stop"}',
  '',
  'data: [DONE]',
  '',
].join('\n')

describe('checkpoints', () => {
  it('names where a checkpoint sits and what it would run', () => {
    expect(
      checkpointLabel({ checkpoint_id: 'c1', step: 1, source: 'loop', next: ['specialist'] }),
    ).toBe('Étape 2 — reprend à specialist')
    expect(checkpointLabel({ checkpoint_id: 'c2', step: 3, source: 'loop', next: [] })).toBe(
      'Étape 4 — fin du run',
    )
    // The input checkpoint is the entry point, not "step 0".
    expect(
      checkpointLabel({ checkpoint_id: 'c0', step: -1, source: 'input', next: ['__start__'] }),
    ).toBe("Point d'entrée — reprend à __start__")
  })

  it('only offers a fork where something is left to run', () => {
    expect(
      isForkable({ checkpoint_id: 'c1', step: 0, source: 'input', next: ['supervisor'] }),
    ).toBe(true)
    expect(isForkable({ checkpoint_id: 'c2', step: 3, source: 'loop', next: [] })).toBe(false)
  })
})

describe('forking', () => {
  const respond = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }))

  it('sends only what was chosen, and returns the branch the stream announced', async () => {
    const fetchImpl = respond(START)
    const branch = await forkRun(
      'chat-1',
      { checkpointId: 'cp-2', specialist: 'pydantic-verdict' },
      fetchImpl as unknown as typeof fetch,
    )

    expect(branch).toBe('branche-1')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/runs/chat-1/fork')
    expect(JSON.parse(String(init.body))).toEqual({
      checkpoint_id: 'cp-2',
      specialist: 'pydantic-verdict',
    })
  })

  it('omits the specialist when the service default is kept', async () => {
    const fetchImpl = respond(START)
    await forkRun('chat-1', { checkpointId: 'cp-2' }, fetchImpl as unknown as typeof fetch)
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ checkpoint_id: 'cp-2' })
  })

  it('surfaces the service refusal instead of a bare status', async () => {
    const fetchImpl = respond(JSON.stringify({ detail: 'spécialiste inconnu : crewai' }), 422)
    await expect(
      forkRun('chat-1', { specialist: 'crewai' }, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow('spécialiste inconnu : crewai')
  })

  it('refuses a stream that never announced a branch', () => {
    expect(() => branchOf('data: {"type": "finish"}\n\n')).toThrow('branche')
  })
})
