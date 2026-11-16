/**
 * A reopened run (MEM-18) comes back as the messages `useChat` shows. A gate
 * decision is the second turn of the same run: reopened as a second brief, the
 * scene showed the gate alone, with an empty inspector (16 November 2026).
 */
import { describe, expect, it } from 'vitest'
import { toMessages, type RunDetail } from '../chat/runs'
import { replay } from '../run/readModel'
import type { RunEventPayload } from '../contracts/ui-stream'

const BRIEF = 'Lis deployment/README.md du dépôt guillaume-flambard/usine'
const ev = (kind: string, at: number, node: string | null, data: object = {}): RunEventPayload =>
  ({ kind, at, node, data }) as RunEventPayload

const RUN: RunDetail = {
  thread_id: 't',
  title: BRIEF,
  status: 'done',
  created_at: '2026-11-16T14:06:00Z',
  turns: 2,
  history: [
    {
      brief: BRIEF,
      answer: 'Une issue est proposée.',
      events: [
        ev('run-started', 0, null),
        ev('node-started', 0.1, 'supervisor', { taskId: 't1' }),
        ev('node-finished', 0.4, 'supervisor', { taskId: 't1', subtasks: ['a'] }),
        ev('node-started', 0.5, 'specialist', { taskId: 't2', task: 'a' }),
        ev('node-finished', 0.9, 'specialist', { taskId: 't2' }),
        ev('node-started', 1, 'synthesize', { taskId: 't3' }),
        ev('node-finished', 1.1, 'synthesize', { taskId: 't3', proposed: 1 }),
        ev('node-started', 1.2, 'human_gate', { taskId: 't4' }),
        ev('gate-opened', 1.3, 'human_gate', { taskId: 't4', gate: { actions: [], notice: '' } }),
      ],
    },
    {
      brief: BRIEF,
      answer: '',
      events: [
        ev('run-started', 0, null, { resumed: true }),
        ev('node-started', 0.1, 'human_gate', { taskId: 't5' }),
        ev('gate-decided', 0.2, 'human_gate', { taskId: 't5', decision: 'reject' }),
        ev('run-finished', 0.3, null, { outcome: 'ok' }),
      ],
    },
  ],
}

describe('toMessages', () => {
  it('gives a gate decision back as a decision, not as a second brief', () => {
    const [, , decision] = toMessages(RUN)
    expect(decision?.role).toBe('user')
    expect(decision?.metadata).toEqual({ gate: 'reject' })
    expect(decision?.parts).toEqual([{ type: 'text', text: 'Décision : rejeter.' }])
  })

  it('keeps a reopened branch as a brief: a fork resumes without a decision', () => {
    const branch = {
      ...RUN,
      history: [
        {
          brief: BRIEF,
          answer: 'ok',
          events: [
            ev('run-started', 0, null, { resumed: true }),
            ev('run-finished', 0.2, null, { outcome: 'ok' }),
          ],
        },
      ],
    }
    const [user] = toMessages(branch)
    expect(user?.metadata).toBeUndefined()
    expect(user?.parts).toEqual([{ type: 'text', text: BRIEF }])
  })

  it('keeps a plain second brief as a brief', () => {
    const second = { ...RUN.history[1]!, events: [ev('run-started', 0, null)], brief: 'et ensuite' }
    const [, , user] = toMessages({ ...RUN, history: [RUN.history[0]!, second] })
    expect(user?.metadata).toBeUndefined()
    expect(user?.parts).toEqual([{ type: 'text', text: 'et ensuite' }])
  })

  it('replays both turns of a decided run as one scene', () => {
    const events = toMessages(RUN)
      .filter((m) => m.role === 'assistant')
      .flatMap((m) => m.parts)
      .filter((p) => p.type === 'data-run-event')
      .map((p) => (p as { data: RunEventPayload }).data)
    const model = replay(events)
    expect(model.nodes.map((n) => n.name)).toEqual([
      'supervisor',
      'specialist',
      'synthesize',
      'human_gate',
    ])
    expect(model.gate?.decision).toBe('reject')
    expect(model.status).toBe('finished')
  })
})
