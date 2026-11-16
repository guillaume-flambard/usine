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

async function mount(model: RunReadModel) {
  return await render(RunScene, { props: { model }, global: { plugins: [ui] } })
}

const nodeText = (state: string) =>
  [...document.querySelectorAll(`[data-node-state="${state}"]`)].map((n) => n.textContent ?? '')

describe('RunScene', () => {
  it('says every state in words, never by colour alone', async () => {
    await mount(
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
    expect(nodeText('finished').every((t) => t.includes('terminé'))).toBe(true)
    expect(nodeText('failed')).toHaveLength(1)
    expect(nodeText('failed')[0]).toContain('en erreur')
    expect(document.querySelector('[data-scene-status]')?.textContent).toContain('Run en erreur')
    // Two edges: supervisor to each specialist; no synthesis yet, so no edge to it.
    expect(document.querySelectorAll('.scene-link')).toHaveLength(2)
    // Each agent on its thread: the supervisor grey, the specialists sky then magenta.
    const threads = [...document.querySelectorAll('[data-node]')].map((n) =>
      n.getAttribute('data-thread'),
    )
    expect(threads).toEqual(['sup', 'sky', 'mag'])
    expect(document.querySelector('[data-scene-description]')?.textContent).toContain(
      'Spécialiste (b) : en erreur',
    )
  })

  it('shows why one specialist failed while the run went on', async () => {
    const reason = 'Budget de durée dépassé (limite 180 s). Rien n’est parti au-delà.'
    await mount(
      replay([
        { kind: 'run-started', at: 0, data: {} },
        started('supervisor', 't1', 0.1),
        finished('supervisor', 't1', 0.6, { subtasks: ['a', 'b'] }),
        started('specialist', 't2', 0.7, { task: 'a' }),
        started('specialist', 't3', 0.7, {
          // Long, like the production run: the task fills its lines.
          task: 'Analyser le contenu de deployment/README.md pour identifier la cause de l’arrêt des mises à jour en production',
        }),
        finished('specialist', 't2', 2.1, {
          specialists: [{ name: 'x', framework: 'f', tokens: 1 }],
        }),
        finished('specialist', 't3', 3.1, {
          specialists: [
            {
              name: 'x',
              framework: 'langchain',
              tokens: 0,
              tools: ['github__get_file_contents'],
              failed: reason,
            },
          ],
        }),
        started('synthesize', 't4', 3.2),
        finished('synthesize', 't4', 3.3),
        { kind: 'run-finished', at: 3.4, data: { outcome: 'ok' } },
      ]),
    )
    await expect.poll(() => document.querySelectorAll('[data-node]').length).toBe(4)
    expect(nodeText('failed')).toHaveLength(1)
    expect(nodeText('failed')[0]).toContain('en erreur')
    expect(document.querySelector('[data-node-failure]')?.textContent?.trim()).toBe(reason)
    // Nothing in the failed card is cut: every block sits inside the card and
    // shows whole lines (the reason was cut in half, 16 November 2026). A
    // clamped paragraph may hide its last lines behind an ellipsis, by design;
    // it must never stop in the middle of one. Fonts differ between machines,
    // so the check is in lines, not pixels.
    const card = document.querySelector('[data-node-state="failed"]') as HTMLElement
    const box = card.getBoundingClientRect()
    for (const child of [...card.children] as HTMLElement[]) {
      const r = child.getBoundingClientRect()
      expect(r.bottom).toBeLessThanOrEqual(box.bottom + 0.5)
      if (child.tagName !== 'P') continue
      const style = getComputedStyle(child)
      const lines =
        (child.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) /
        parseFloat(style.lineHeight)
      expect(Math.abs(lines - Math.round(lines))).toBeLessThan(0.05)
    }
    expect(document.querySelector('[data-scene-status]')?.textContent).toContain(
      'Run terminé, 1 spécialiste en erreur',
    )
    // The whole reason is readable: three lines leave room for the longest one.
    const shown = document.querySelector('[data-node-failure]') as HTMLElement
    expect(shown.scrollHeight - shown.clientHeight).toBeLessThanOrEqual(1)
  })

  it('draws a waiting gate as the black knot, with its question', async () => {
    await mount(
      replay([
        { kind: 'run-started', at: 0, data: {} },
        started('synthesize', 't1', 0.1),
        finished('synthesize', 't1', 0.2),
        started('human_gate', 't2', 0.3),
        {
          kind: 'gate-opened',
          at: 0.3,
          node: 'human_gate',
          data: {
            taskId: 't2',
            gate: {
              actions: [
                { kind: 'send', target: '#annonces', justification: 'publier', preview: 'v2' },
              ],
              notice: "Revenir en arrière restaure l'état du run, pas le monde.",
            },
          },
        },
      ]),
    )
    await expect.poll(() => nodeText('waiting')[0] ?? '').toContain('en attente')
    expect(document.querySelector('[data-scene-status]')?.textContent).toContain(
      'À la porte, en attente de décision',
    )
    const knot = document.querySelector('[data-node="human_gate"]') as HTMLElement
    expect(knot.tagName).toBe('BUTTON')
    expect(knot.getAttribute('data-thread')).toBe('ink')
    expect(knot.textContent).toContain('Porte humaine')
    expect(knot.textContent).toContain('J’envoie ce message')
  })

  it('draws 200 events as they arrive without a long frame', async () => {
    const model = ref<RunReadModel>(EMPTY_RUN)
    const screen = await render(RunScene, {
      props: { model: model.value },
      global: { plugins: [ui] },
    })
    const events: RunEventPayload[] = [{ kind: 'run-started', at: 0, data: {} }]
    let at = 0
    events.push(started('supervisor', 't1', (at += 0.01)))
    events.push(finished('supervisor', 't1', (at += 0.01)))
    for (let i = 2; i < 100; i++) events.push(started('specialist', `t${i}`, (at += 0.01)))
    for (let i = 2; i < 100; i++) events.push(finished('specialist', `t${i}`, (at += 0.01)))
    events.push(started('synthesize', 't100', (at += 0.01)))
    expect(events).toHaveLength(200)

    // Each event is one reactive update, as in a live stream: a regression makes
    // updates stop being cheap. The first three pay the JIT and are not
    // measured. The ceiling is a tripwire, not a stopwatch, and it reads the
    // 95th percentile: on the busy VPS builder a single garbage-collection
    // pause stretched one frame to 185 ms (16 November 2026), while a real
    // regression slows most frames.
    const durations: number[] = []
    for (const [index, event] of events.entries()) {
      const t0 = performance.now()
      model.value = reduceRun(model.value, event)
      await screen.rerender({ model: model.value })
      await nextTick()
      if (index >= 3) durations.push(performance.now() - t0)
    }
    expect(document.querySelectorAll('[data-node]')).toHaveLength(100)
    durations.sort((a, b) => a - b)
    const p95 = durations[Math.floor(durations.length * 0.95)]!
    console.info(`scene: 200 events, p95 update ${p95.toFixed(1)} ms`)
    expect(p95).toBeLessThan(150)
  })
})

describe('motion on the threads (MEM-86)', () => {
  it('flows a dash along the thread of a node while it runs, and only then', async () => {
    const running = replay([
      { kind: 'run-started', at: 0, data: {} },
      started('supervisor', 't1', 0.1),
      finished('supervisor', 't1', 0.2),
      started('specialist', 't2', 0.3, { task: 'a' }),
    ])
    const screen = await mount(running)
    await expect.poll(() => document.querySelectorAll('[data-flowing]').length).toBe(1)
    await screen.rerender({
      model: reduceRun(running, finished('specialist', 't2', 0.9)),
    })
    await expect.poll(() => document.querySelectorAll('[data-flowing]').length).toBe(0)
  })
})

describe('tool calls (MEM-38)', () => {
  it('names the tools the run called, once a specialist reports them', async () => {
    const model = replay([
      { kind: 'run-started', at: 0, data: {} },
      { kind: 'node-started', at: 0.1, node: 'specialist', data: { taskId: 't1' } },
      {
        kind: 'node-finished',
        at: 0.4,
        node: 'specialist',
        data: {
          taskId: 't1',
          specialists: [
            {
              name: 'mcp-agent:lab-fast',
              framework: 'langchain',
              tokens: 12,
              tools: ['docs__search', 'docs__fetch'],
            },
          ],
        },
      },
    ])

    await render(RunScene, { props: { model }, global: { plugins: [ui] } })

    const line = () => document.querySelector('[data-tools]') as HTMLElement | null
    expect(line()).not.toBeNull()
    // Sorted: the same run must read the same way whatever order they ran in.
    expect(line()!.textContent).toContain('docs__fetch, docs__search')
    // Read by assistive tech too, not only drawn.
    expect(document.querySelector('[data-scene-description]')!.textContent).toContain(
      'Outils appelés',
    )
  })

  it('says nothing when no tool ran', async () => {
    const model = replay([
      { kind: 'run-started', at: 0, data: {} },
      { kind: 'node-started', at: 0.1, node: 'specialist', data: { taskId: 't1' } },
      {
        kind: 'node-finished',
        at: 0.4,
        node: 'specialist',
        data: {
          taskId: 't1',
          specialists: [{ name: 'chat', framework: 'langchain', tokens: 3, tools: [] }],
        },
      },
    ])

    await render(RunScene, { props: { model }, global: { plugins: [ui] } })
    expect(document.querySelector('[data-tools]')).toBeNull()
  })
})
