// Interface promises can only be checked in a real browser: the page that
// never scrolls, the keyboard, colour never carrying information alone.
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import FactoryApp from '../FactoryApp.vue'
import { installTelemetry, type Event } from '../../telemetry'
import '../../assets/tokens.css'
import '../../assets/app.css'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function mount() {
  const screen = render(FactoryApp)
  await wait(60)
  return screen
}

// The run is born at the replayed model's pace: the wait follows that pace, it
// does not guess it.
const startRun = async () => {
  document.querySelector<HTMLButtonElement>('.pane .button')?.click()
  await wait(9000)
}

/**
 * For each node: its state, and whether it carries a signal that is not
 * colour — shape mark, dashes, stroke width, opacity or strike-through.
 */
function collectSignals(): [string, boolean][] {
  return [...document.querySelectorAll<SVGGElement>('.node')].map((node) => {
    const state = node.getAttribute('data-state') ?? '?'
    const frame = node.querySelector('.node-frame')
    const style = frame === null ? undefined : getComputedStyle(frame)
    const label = node.querySelector('.node-label')
    const labelStyle = label === null ? undefined : getComputedStyle(label)
    const signal =
      node.querySelector('.node-mark') !== null ||
      (style?.strokeDasharray ?? 'none') !== 'none' ||
      Number.parseFloat(style?.strokeWidth ?? '1') !== 1 ||
      Number.parseFloat(getComputedStyle(node).opacity) < 1 ||
      (labelStyle?.textDecorationLine ?? 'none').includes('line-through')
    return [state, signal]
  })
}

describe('the shell in a browser', () => {
  it('never scrolls the page', async () => {
    await mount()
    expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(
      document.documentElement.clientHeight + 1,
    )
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth + 1,
    )
  })

  it('fills the whole height, with no editorial page', async () => {
    await mount()
    const app = document.querySelector('.app')
    expect(app).not.toBeNull()
    expect(app?.getBoundingClientRect().height ?? 0).toBeGreaterThan(window.innerHeight * 0.9)
    // The original editorial page had a hero; the application has none.
    expect(document.querySelector('.hero')).toBeNull()
  })

  it('reaches the critical path from the keyboard', async () => {
    await mount()
    const brief = document.querySelector<HTMLTextAreaElement>('#brief')
    const button = document.querySelector<HTMLButtonElement>('.pane .button')
    expect(brief).not.toBeNull()
    expect(button).not.toBeNull()

    brief?.focus()
    expect(document.activeElement).toBe(brief)
    button?.focus()
    expect(document.activeElement).toBe(button)
  })

  it('makes nodes focusable and named', async () => {
    await mount()
    await startRun()

    const nodes = [...document.querySelectorAll<SVGGElement>('.node')]
    expect(nodes.length).toBeGreaterThan(3)
    for (const node of nodes) {
      expect(node.getAttribute('tabindex')).toBe('0')
      // A node with no accessible name does not exist for a screen reader.
      expect((node.getAttribute('aria-label') ?? '').length).toBeGreaterThan(5)
    }
  })

  it('never entrusts a state to colour alone', async () => {
    await mount()
    await startRun()
    const statesSeen = new Set(collectSignals().map(([state]) => state))

    // Rejecting surfaces the released state, which a nominal run never
    // produces: without this click the test would cover two or three states.
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.gate-actions .button')]
    expect(buttons).toHaveLength(2)
    buttons[0]?.click()
    await wait(600)

    for (const [state, signal] of collectSignals()) {
      statesSeen.add(state)
      expect(signal, `state "${state}" has no signal beyond colour`).toBe(true)
    }
    expect(statesSeen.has('released'), 'no released node was observed').toBe(true)
    expect(statesSeen.size).toBeGreaterThanOrEqual(2)
  })

  it('scrolls the graph inside its container, never the page', async () => {
    await mount()
    await startRun()

    const canvas = document.querySelector<HTMLElement>('.canvas')
    expect(canvas).not.toBeNull()
    expect(getComputedStyle(canvas as HTMLElement).overflow).not.toBe('visible')
    // Neither horizontally nor vertically, even once the graph is deployed.
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth + 1,
    )
    expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(
      document.documentElement.clientHeight + 1,
    )
  })

  it('gives the graph a name and a description readable without seeing it', async () => {
    await mount()
    await startRun()

    const svg = document.querySelector('svg[role="group"]')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-label')).toBeTruthy()
    const desc = document.querySelector('desc')
    expect((desc?.textContent ?? '').length).toBeGreaterThan(30)
  })
})

describe('reduced motion', () => {
  it('neutralises the appearance without losing information', async () => {
    await mount()
    await startRun()

    // The rule must exist in the loaded stylesheet: without it, the system
    // preference would change nothing.
    const rules = [...document.styleSheets].flatMap((sheet) => {
      try {
        return [...sheet.cssRules]
      } catch {
        return []
      }
    })
    const block = rules.find(
      (rule): rule is CSSMediaRule =>
        rule instanceof CSSMediaRule && rule.conditionText.includes('prefers-reduced-motion'),
    )
    expect(block, 'no reduced-motion rule in the loaded stylesheet').toBeDefined()

    // And the nodes are still there, with their state: the motion goes, not
    // the information.
    const nodes = [...document.querySelectorAll('.node')]
    expect(nodes.length).toBeGreaterThan(3)
    for (const node of nodes) {
      expect(node.getAttribute('data-state')).toBeTruthy()
      expect((node as HTMLElement).getBoundingClientRect().width).toBeGreaterThan(0)
    }
  })
})

describe('the delivered product, end to end in a browser', () => {
  it('classifies a text typed by a human after the gate', async () => {
    await mount()
    await startRun()

    // The gate halts the run: it is what makes approval necessary.
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.gate-actions .button')]
    expect(buttons).toHaveLength(2)
    buttons[1]?.click()
    await wait(500)

    const field = document.querySelector<HTMLTextAreaElement>('#product-input')
    expect(field, 'the delivered product did not appear').not.toBeNull()
    if (field === null) return
    field.value = 'Ce complément guérit les carences. Il contribue à réduire la fatigue.'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await wait(60)

    document.querySelector<HTMLButtonElement>('.product .button')?.click()
    await wait(120)

    // The page does not know what the product returns: it was written during
    // the run. It shows its output as is, and that is what we read.
    const output = document.querySelector('.product-output')?.textContent ?? ''
    expect(output).toContain('interdit')
    expect(output).toContain('1924/2006')
    expect(output).toContain('autorisé')
  })
})

describe('measurement, as the shell produces it', () => {
  it('counts the four facts, once each, at the right moments', async () => {
    const log: Event[] = []
    installTelemetry({ count: (e) => log.push(e) })
    try {
      await mount()
      await startRun()
      expect(log).toEqual(['run-started', 'gate-reached'])

      document.querySelectorAll<HTMLButtonElement>('.gate-actions .button')[1]?.click()
      await wait(500)
      expect(log).toEqual(['run-started', 'gate-reached', 'payoff-shown'])

      const field = document.querySelector<HTMLTextAreaElement>('#product-input')
      expect(field).not.toBeNull()
      if (field === null) return
      field.value = 'Ce complément guérit les carences.'
      field.dispatchEvent(new Event('input', { bubbles: true }))
      await wait(60)
      document.querySelector<HTMLButtonElement>('.product .button')?.click()
      await wait(80)
      // Two submissions count as one fact: that is the module's rule.
      document.querySelector<HTMLButtonElement>('.product .button')?.click()
      await wait(80)

      expect(log).toEqual(['run-started', 'gate-reached', 'payoff-shown', 'check-submitted'])
    } finally {
      installTelemetry(undefined)
    }
  })
})

describe('changing the need from the page', () => {
  it('warns when the demo cannot play the chosen need', async () => {
    await mount()
    const picker = document.querySelector<HTMLSelectElement>('.picker')
    expect(picker, 'the example picker is missing').not.toBeNull()
    if (picker === null) return
    expect(picker.options.length).toBeGreaterThanOrEqual(3)

    picker.value = 'advertising'
    picker.dispatchEvent(new Event('change', { bubbles: true }))
    await wait(200)

    const brief = document.querySelector<HTMLTextAreaElement>('#brief')
    expect(brief?.value ?? '').toContain('publicitaires')

    // The demo only knows how to replay one need. It says so before the click
    // rather than spawning a European lawyer for something else.
    const note = [...document.querySelectorAll('.worksite-summary')]
      .map((p) => p.textContent ?? '')
      .join(' ')
    expect(note).toContain('n’est pas celui de la démonstration')

    await startRun()
    const born = [...document.querySelectorAll<SVGGElement>('.node')]
    expect(born).toHaveLength(1)
  })
})
