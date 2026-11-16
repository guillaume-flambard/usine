/**
 * The run read model (MEM-17), rebuilt from the runs the service recorded
 * (services/api/tests/fixtures/chat-stream/, written by the real service and
 * parsed here by the real ai@7.0.165).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseJsonEventStream, uiMessageChunkSchema } from 'ai'
import type { RunEventPayload } from '../contracts/ui-stream'
import { layoutRun } from '../run/layout'
import { replay } from '../run/readModel'

const FIXTURES = new URL('../../../../services/api/tests/fixtures/chat-stream/', import.meta.url)

async function recordedEvents(name: string): Promise<RunEventPayload[]> {
  const bytes = readFileSync(new URL(name, FIXTURES))
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes))
      controller.close()
    },
  })
  const events: RunEventPayload[] = []
  for await (const result of parseJsonEventStream({ stream, schema: uiMessageChunkSchema })) {
    if (!result.success) throw result.error
    const chunk = result.value as { type: string; data?: unknown }
    if (chunk.type === 'data-run-event') events.push(chunk.data as RunEventPayload)
  }
  return events
}

describe('run read model', () => {
  it('a recorded run, replayed, gives the same read model', async () => {
    const events = await recordedEvents('ok.sse')
    const first = replay(events)
    // The archive is plain JSON: a run exported then reloaded replays alike.
    const reloaded = replay(JSON.parse(JSON.stringify(events)))
    expect(reloaded).toEqual(first)

    expect(first.status).toBe('finished')
    expect(first.nodes.map((n) => [n.id, n.name, n.state])).toEqual([
      ['t1', 'supervisor', 'finished'],
      ['t2', 'specialist', 'finished'],
      ['t3', 'synthesize', 'finished'],
    ])
    expect(first.nodes[0]?.subtasks).toEqual(['relire les portes'])
    expect(first.nodes[1]?.task).toBe('relire les portes')
    expect(first.edges).toEqual([
      { from: 't1', to: 't2' },
      { from: 't2', to: 't3' },
    ])
  })

  it('a failed run marks the nodes still running as failed, from its event', async () => {
    const model = replay(await recordedEvents('model-error.sse'))
    expect(model.status).toBe('failed')
    expect(model.nodes.find((n) => n.name === 'specialist')?.state).toBe('failed')
    expect(model.nodes.find((n) => n.name === 'supervisor')?.state).toBe('finished')
    // The reason is in the archive, so a reopened or compared run can say it.
    expect(model.error).toContain('saturé')
  })

  it('a run stopped on a human gate waits, with its actions and the reminder', async () => {
    const model = replay(await recordedEvents('gate.sse'))
    expect(model.status).toBe('waiting')
    expect(model.nodes.find((n) => n.name === 'human_gate')?.state).toBe('waiting')
    expect(model.gate?.actions).toEqual([
      expect.objectContaining({ kind: 'send', target: '#annonces' }),
    ])
    expect(model.gate?.notice).toMatch(/pas le monde/)
    expect(model.edges).toContainEqual({
      from: model.nodes.find((n) => n.name === 'synthesize')!.id,
      to: model.nodes.find((n) => n.name === 'human_gate')!.id,
    })
  })

  it('nothing exists before an event says so', () => {
    const model = replay([])
    expect(model).toMatchObject({ status: 'idle', nodes: [], edges: [] })
  })

  it('200 events reduce and lay out within a frame budget, even on a busy machine', () => {
    // 1 supervisor, 98 specialists, 1 synthesis: 200 node events.
    const events: RunEventPayload[] = [{ kind: 'run-started', at: 0, data: {} }]
    let at = 0
    const node = (kind: RunEventPayload['kind'], name: string, id: string) =>
      events.push({ kind, at: (at += 0.01), node: name, data: { taskId: id } })
    node('node-started', 'supervisor', 't1')
    node('node-finished', 'supervisor', 't1')
    for (let i = 2; i < 100; i++) node('node-started', 'specialist', `t${i}`)
    for (let i = 2; i < 100; i++) node('node-finished', 'specialist', `t${i}`)
    node('node-started', 'synthesize', 't100')
    node('node-finished', 'synthesize', 't100')

    // Warm up first: the first pass pays for the JIT, and a cold pass read as a
    // slow layout (measured: the same work costs 30 to 80 ms alone, up to
    // 260 ms while the machine is building next to it, 2026-11-15).
    replay(events)
    const warm = replay(events)
    layoutRun(warm.nodes, warm.edges)

    const start = performance.now()
    const model = replay(events)
    const placed = layoutRun(model.nodes, model.edges)
    const elapsed = performance.now() - start

    expect(model.nodes).toHaveLength(100)
    expect(placed.boxes.size).toBe(100)
    // A tripwire for a quadratic regression, not a stopwatch: a busy machine
    // must not turn the build red.
    expect(elapsed).toBeLessThan(500)
  })

  it('a specialist that failed beside the others shows its reason, and the run finishes', async () => {
    // Production, 16 November 2026: one timeout used to stop the whole run.
    const model = replay(await recordedEvents('partial-failure.sse'))

    expect(model.status).toBe('finished')
    const specialists = model.nodes.filter((n) => n.name === 'specialist')
    expect(specialists.map((n) => n.state).sort()).toEqual(['failed', 'finished'])
    const failed = specialists.find((n) => n.state === 'failed')
    expect(failed?.failure).toMatch(/^Le modèle est saturé/)
    expect(model.nodes.find((n) => n.name === 'synthesize')?.state).toBe('finished')
  })
})
