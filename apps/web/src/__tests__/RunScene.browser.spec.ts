/**
 * The scene (MEM-17) in a real browser: states said in words, not colour
 * alone, and a 200-event run drawn without a long frame.
 */
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { nextTick, ref } from 'vue'
import ui from '@nuxt/ui/vue-plugin'
import RunScene from '../components/RunScene.vue'
import type { RunEventPayload } from '../contracts/ui-stream'
import { EMPTY_RUN, reduceRun, replay, type RunReadModel } from '../run/readModel'
import '../assets/main.css'

const started = (name: string, id: string, at: number, data = {}): RunEventPayload => ({
  kind: 'node-started',
  at,
  node: name,
  data: { taskId: id, ...data },
})
const finished = (name: string, id: string, at: number, data = {}): RunEventPayload => ({
  kind: 'node-finished',
  at,
  node: name,
  data: { taskId: id, ...data },
})

function mount(model: RunReadModel) {
  return render(RunScene, { props: { model }, global: { plugins: [ui] } })
}

const nodeText = (state: string) =>
  [...document.querySelectorAll(`[data-node-state="${state}"]`)].map((n) => n.textContent ?? '')

describe('RunScene', () => {
  it('says every state in words, never by colour alone', async () => {
    mount(
      replay([
        { kind: 'run-started', at: 0, data: {} },
        started('supervisor', 't1', 0.1),
        finished('supervisor', 't1', 0.6, { subtasks: ['a', 'b'] }),
        started('specialist', 't2', 0.7, { task: 'a' }),
        started('specialist', 't3', 0.7, { task: 'b' }),
        finished('specialist', 't2', 2.1),
        { kind: 'run-finished', at: 2.5, data: { outcome: 'error' } },
      ]),
    )
    await expect.poll(() => document.querySelectorAll('[data-node]').length).toBe(3)
    expect(nodeText('finished').every((t) => t.includes('✓ terminé'))).toBe(true)
    expect(nodeText('failed')).toHaveLength(1)
    expect(nodeText('failed')[0]).toContain('✕ en erreur')
    expect(document.querySelector('[data-scene-status]')?.textContent).toContain('Run en erreur')
    // Two edges: supervisor to each specialist; no synthesis yet, so no edge to it.
    expect(document.querySelectorAll('.scene-link')).toHaveLength(2)
    expect(document.querySelector('desc')?.textContent).toContain('Spécialiste (b) : en erreur')
  })

  it('draws 200 events as they arrive without a long frame', async () => {
    const model = ref<RunReadModel>(EMPTY_RUN)
    const screen = render(RunScene, { props: { model: model.value }, global: { plugins: [ui] } })
    const events: RunEventPayload[] = [{ kind: 'run-started', at: 0, data: {} }]
    let at = 0
    events.push(started('supervisor', 't1', (at += 0.01)))
    events.push(finished('supervisor', 't1', (at += 0.01)))
    for (let i = 2; i < 100; i++) events.push(started('specialist', `t${i}`, (at += 0.01)))
    for (let i = 2; i < 100; i++) events.push(finished('specialist', `t${i}`, (at += 0.01)))
    events.push(started('synthesize', 't100', (at += 0.01)))
    expect(events).toHaveLength(200)

    // Each event is one reactive update, as in a live stream; the slowest one
    // must stay under a 50 ms long task (the RAIL threshold).
    let slowest = 0
    for (const event of events) {
      const t0 = performance.now()
      model.value = reduceRun(model.value, event)
      await screen.rerender({ model: model.value })
      await nextTick()
      slowest = Math.max(slowest, performance.now() - t0)
    }
    expect(document.querySelectorAll('[data-node]')).toHaveLength(100)
    console.info(`scene: 200 events, slowest update ${slowest.toFixed(1)} ms`)
    expect(slowest).toBeLessThan(50)
  })
})
