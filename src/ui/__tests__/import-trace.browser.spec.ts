// A foreign trace, imported, replays and is measured — but it is not forkable,
// because it carries no recompilable behaviour (AD-49). These promises only hold
// in a real browser: the file input, the replayed graph, the absent fork gate.
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import FactoryApp from '../FactoryApp.vue'
import '../../assets/tokens.css'
import '../../assets/app.css'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// A minimal LangGraph export: two nodes, one finishes, one fails. No screen and
// no behaviour source — exactly what makes it non-forkable.
const LANGGRAPH_TRACE = JSON.stringify({
  graph: 'agent-importé',
  steps: [
    { node: 'planner', start: 1_710_000_000_000, end: 1_710_000_000_500, output: 'plan' },
    { node: 'tool', start: 1_710_000_000_600, error: 'timeout' },
  ],
})

async function importTraceFile(json: string) {
  render(FactoryApp)
  await wait(60)
  const input = document.querySelector<HTMLInputElement>('.import-trace input[type="file"]')
  if (input === null) throw new Error('file input not found')
  const file = new File([json], 'trace.json', { type: 'application/json' })
  const data = new DataTransfer()
  data.items.add(file)
  input.files = data.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  // Long enough for the file read + the paced replay of a short stream.
  await wait(1200)
}

describe('importing a foreign trace', () => {
  it('replays it: the imported nodes show on the graph', async () => {
    await importTraceFile(LANGGRAPH_TRACE)
    const labels = [...document.querySelectorAll('.node-label')].map((n) => n.textContent?.trim())
    expect(labels).toContain('planner')
    expect(labels).toContain('tool')
  })

  it('measures it and states it is not forkable', async () => {
    await importTraceFile(LANGGRAPH_TRACE)
    const banner = document.querySelector('.foreign-banner')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toMatch(/non forkable/)
    // The measured event count is a real number read off the imported stream.
    expect(banner?.textContent).toMatch(/\d+ événements/)
  })

  it('offers no fork affordance for a foreign run', async () => {
    await importTraceFile(LANGGRAPH_TRACE)
    expect(document.querySelector('.fork-start')).toBeNull()
    const buttons = [...document.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(buttons).not.toContain('Forker ce run')
  })

  // Regression guard: an internal recorded run (the demo example) still serves an
  // application and still offers the fork gate. Only foreign traces lose it.
  it('keeps the fork affordance for an internal recorded run', async () => {
    render(FactoryApp)
    await wait(60)
    // Start a run the way a visitor does: pick the first example, then launch.
    const brief = document.querySelector<HTMLTextAreaElement>('#brief')
    if (brief !== null && brief.value.length === 0) {
      document.querySelector<HTMLButtonElement>('.examples .picker')?.click()
      await wait(120)
    }
    document.querySelector<HTMLButtonElement>('.composer .button')?.click()
    await wait(9000)
    expect(document.querySelector('.fork-start')).not.toBeNull()
  })
})
