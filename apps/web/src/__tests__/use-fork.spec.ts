/**
 * The fork dialog's state (MEM-23, MEM-33), without a browser: which checkpoint
 * is offered by default, what is sent, and what the service's refusal becomes.
 */
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useFork } from '../chat/useFork'

const CHECKPOINTS = [
  { checkpoint_id: 'cp-1', step: -1, source: 'input', next: ['__start__'] },
  { checkpoint_id: 'cp-2', step: 1, source: 'loop', next: ['specialist'] },
  { checkpoint_id: 'cp-3', step: 3, source: 'loop', next: [] },
]

const SPECIALISTS = {
  items: [
    {
      name: 'chat-model',
      identity: { name: 'chat:lab-fast', framework: 'langchain', framework_version: '1' },
    },
  ],
}

const STREAM = [
  'data: {"type": "start", "messageId": "a1", "messageMetadata": {"threadId": "branche-1"}}',
  '',
  'data: [DONE]',
  '',
].join('\n')

function stub(): { bodies: unknown[]; fail?: { status: number; detail: string } } {
  const state: { bodies: unknown[]; fail?: { status: number; detail: string } } = { bodies: [] }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/checkpoints')) return Response.json(CHECKPOINTS)
    if (url === '/api/specialists') return Response.json(SPECIALISTS)
    if (url.endsWith('/fork')) {
      state.bodies.push(JSON.parse(String(init?.body)))
      if (state.fail)
        return Response.json({ detail: state.fail.detail }, { status: state.fail.status })
      return new Response(STREAM, { headers: { 'content-type': 'text/event-stream' } })
    }
    return new Response('not found', { status: 404 })
  })
  return state
}

async function opened() {
  const open = ref(true)
  const fork = useFork(ref('chat-1'), open)
  await vi.waitFor(() => expect(fork.checkpoints.value).toHaveLength(3))
  expect(fork.specialists.value).toHaveLength(1)
  return { fork, open }
}

describe('the fork dialog state', () => {
  it('offers the point before the specialists, never the end of the run', async () => {
    // The first forkable point (before the synthesis) gave a one-node branch
    // with nothing to compare (audit, 16 November 2026).
    stub()
    const { fork } = await opened()
    expect(fork.chosen.value).toBe('cp-2')
    expect(fork.canFork.value).toBe(true)
    // The select shows the service default instead of a blank.
    expect(fork.specialist.value).toBe('default')
  })

  it('sends the chosen point and the service default when no specialist is picked', async () => {
    const state = stub()
    const { fork } = await opened()
    expect(await fork.fork()).toBe('branche-1')
    expect(state.bodies).toEqual([{ checkpoint_id: 'cp-2' }])
    expect(fork.busy.value).toBe(false)
  })

  it('sends the pinned specialist when one is chosen', async () => {
    const state = stub()
    const { fork } = await opened()
    fork.specialist.value = 'pydantic-verdict'

    expect(await fork.fork()).toBe('branche-1')
    expect(state.bodies).toEqual([{ checkpoint_id: 'cp-2', specialist: 'pydantic-verdict' }])
  })

  it('turns a refusal into a readable message and no branch', async () => {
    const state = stub()
    state.fail = { status: 422, detail: 'spécialiste inconnu : crewai' }
    const { fork } = await opened()

    expect(await fork.fork()).toBeNull()
    expect(fork.failure.value).toContain('crewai')
    expect(fork.busy.value).toBe(false)
  })

  it('shows what the checkpoints endpoint answered when it is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('boom', { status: 500 }),
    )
    const fork = useFork(ref('chat-1'), ref(true))
    await vi.waitFor(() => expect(fork.failure.value).toContain('500'))
    expect(fork.canFork.value).toBe(false)
  })
})
