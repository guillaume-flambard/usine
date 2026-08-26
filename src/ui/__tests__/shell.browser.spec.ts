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
  // The field starts empty. In demo mode the recorded-run entry writes the one
  // brief the replay knows and launches it — the way a keyless visitor starts.
  const brief = document.querySelector<HTMLTextAreaElement>('#brief')
  if (brief !== null && brief.value.length === 0) {
    document.querySelector<HTMLButtonElement>('.recorded-run')?.click()
    await wait(9000)
    return
  }
  document.querySelector<HTMLButtonElement>('.composer .button')?.click()
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
    const button = document.querySelector<HTMLButtonElement>('.composer .button')
    expect(brief).not.toBeNull()
    expect(button).not.toBeNull()

    brief?.focus()
    expect(document.activeElement).toBe(brief)

    // Le bouton ne s'active qu'une fois un besoin écrit : un lancement sans
    // brief ne produirait rien, et un bouton actif qui ne fait rien est pire
    // qu'un bouton éteint.
    expect(button?.disabled).toBe(true)
    // Writing a need enables the launch — no example chip does it for us.
    brief!.value = 'un minuteur pomodoro'
    brief!.dispatchEvent(new Event('input', { bubbles: true }))
    await wait(150)

    const ready = document.querySelector<HTMLButtonElement>('.composer .button')
    expect(ready?.disabled).toBe(false)
    ready?.focus()
    expect(document.activeElement).toBe(ready)
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
    // the information. The graph folds itself once the application serves, so
    // it is unfolded here the way a visitor would — by asking for it.
    document.querySelector<HTMLButtonElement>('.graph-summary')?.click()
    await wait(120)

    const nodes = [...document.querySelectorAll('.node')]
    expect(nodes.length).toBeGreaterThan(3)
    for (const node of nodes) {
      expect(node.getAttribute('data-state')).toBeTruthy()
      expect((node as HTMLElement).getBoundingClientRect().width).toBeGreaterThan(0)
    }
  })
})

describe('the application, end to end in a browser', () => {
  it('serves the application before the gate, in an unreachable frame', async () => {
    await mount()
    await startRun()

    // No approval, no click on the gate. If this test ever needs a decision
    // first, the product has gone back to delivering at the end.
    const frame = document.querySelector<HTMLIFrameElement>('.live-frame')
    expect(frame, "l'application n'est pas apparue").not.toBeNull()

    // The frame is sandboxed with an opaque origin: the host page cannot read
    // it, which is also why the interactions inside it are exercised in
    // `frame.browser.spec.ts` rather than from here.
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame?.contentDocument).toBeNull()

    // And the gate is still there, above what it decides the fate of.
    expect(document.querySelectorAll('.gate-actions .button')).toHaveLength(2)
  })

  it('says what the hot replacement spared, without overstating it', async () => {
    await mount()
    await startRun()
    const counter = document.querySelector('.live-counter')?.textContent ?? ''

    expect(counter).toContain('remplacement')
    // Zero restarts is the half of the claim that must be measured rather
    // than assumed, so it is on screen too.
    expect(counter).toContain('0 redémarrage')
    expect(counter).toContain('interaction')
  })
})

describe('measurement, as the shell produces it', () => {
  it('counts the facts in the order the run produces them', async () => {
    const log: Event[] = []
    installTelemetry({ count: (e) => log.push(e) })
    try {
      await mount()
      await startRun()

      // The application served before the gate opened. That order is the
      // product's whole claim, so the measurement follows it rather than the
      // other way round.
      expect(log).toEqual(['run-started', 'product-served', 'gate-reached'])
    } finally {
      installTelemetry(undefined)
    }
  })
})

describe('changing the need from the page', () => {
  it('warns when the demo cannot play the chosen need', async () => {
    await mount()

    // No jargon example chips any more: the field starts empty.
    expect(document.querySelectorAll('.examples').length).toBe(0)
    const brief = document.querySelector<HTMLTextAreaElement>('#brief')
    expect(brief?.value).toBe('')

    // A need the demo cannot replay: it says so next to the launch button
    // rather than spawning a European lawyer for a syllable counter.
    brief!.value = 'un convertisseur de devises'
    brief!.dispatchEvent(new Event('input', { bubbles: true }))
    await wait(150)

    const hint = document.querySelector('.composer-hint')?.textContent ?? ''
    expect(hint).toContain('ne produira rien')

    document.querySelector<HTMLButtonElement>('.composer .button')?.click()
    await wait(9000)
    const born = [...document.querySelectorAll<SVGGElement>('.node')]
    expect(born).toHaveLength(1)
  })
})

describe('the graph gives way to the application', () => {
  it('folds itself once something serves, and says what it proved', async () => {
    await mount()
    await startRun()

    // A graph fascinates for twenty seconds; an application is used. Once one
    // serves, the graph is a summary line — and the line carries the numbers
    // that justify having watched it.
    const summary = document.querySelector<HTMLButtonElement>('.graph-summary')
    expect(summary, 'no graph summary line').not.toBeNull()
    expect(summary?.textContent ?? '').toContain('remplacement')
    expect(summary?.getAttribute('aria-expanded')).toBe('false')

    const node = document.querySelector<SVGGElement>('.node')
    expect(node?.getBoundingClientRect().width).toBe(0)

    summary?.click()
    await wait(120)

    expect(summary?.getAttribute('aria-expanded')).toBe('true')
    expect(
      document.querySelector<SVGGElement>('.node')?.getBoundingClientRect().width,
    ).toBeGreaterThan(0)
  })
})

describe('the replay, announced', () => {
  it('says it is a replay at all times, and says why', async () => {
    await mount()

    // Permanent, not a toast that fades: a visitor arriving mid-run must be
    // able to tell a replay from a live run without having seen the start.
    expect(document.querySelector('.status')?.textContent ?? '').toContain('rejoué')

    document.querySelector<HTMLButtonElement>('.status-toggle')?.click()
    await wait(60)
    const explanation = document.querySelector('#status-detail')?.textContent ?? ''

    // The reason matters: "no model connected" and "your capacity for today
    // is spent" are different facts, and only one of them is about the site.
    expect(explanation).toContain('Aucun modèle n’est branché')
    // And what is still real is named, rather than left to be assumed false.
    expect(explanation).toContain('fil isolé')
  })

  it('runs the replay through the same views as a live run', async () => {
    await mount()
    await startRun()

    // Same graph, same gate, same application. If a replay needed its own
    // path, it would drift from the live one and stop being a proof.
    expect(document.querySelectorAll('.node').length).toBeGreaterThan(3)
    expect(document.querySelector('.live-frame')).not.toBeNull()
    expect(document.querySelectorAll('.gate-actions .button')).toHaveLength(2)
  })
})

describe('la zone du run tient sa géométrie', () => {
  it('empile le résumé et le graphe au lieu de les mettre côte à côte', async () => {
    await mount()
    await startRun()

    // Déplié d'abord : replié, le graphe est en display:none et sa largeur
    // vaut zéro — ce qui ne dit rien de sa géométrie.
    document.querySelector<HTMLButtonElement>('.graph-summary')?.click()
    await wait(150)

    const zone = document.querySelector<HTMLElement>('.zone')
    const canvas = document.querySelector<HTMLElement>('.canvas')
    const summary = document.querySelector<HTMLElement>('.graph-summary')
    expect(zone && canvas && summary).toBeTruthy()
    if (zone === null || canvas === null || summary === null) return

    // En ligne, le résumé devenait un voisin du graphe et lui volait sa
    // largeur : le tracé se retrouvait écrasé contre le bord.
    expect(getComputedStyle(zone).flexDirection).toBe('column')
    expect(canvas.getBoundingClientRect().width).toBeGreaterThan(
      zone.getBoundingClientRect().width * 0.9,
    )
    expect(summary.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      canvas.getBoundingClientRect().top + 1,
    )
  })

  it('pose l’application au bas de la zone, jamais à côté du graphe', async () => {
    await mount()
    await startRun()

    const canvas = document.querySelector<HTMLElement>('.canvas')
    const app = document.querySelector<HTMLElement>('.live-app')
    expect(app).not.toBeNull()
    if (canvas === null || app === null) return

    expect(getComputedStyle(app).position).toBe('absolute')
    // Elle recouvre le bas : le graphe garde toute sa largeur au-dessus.
    expect(app.getBoundingClientRect().width).toBeGreaterThan(
      canvas.getBoundingClientRect().width * 0.9,
    )
  })
})

// The redesign (change atelier-redesign): the scene is legible and honest in
// every state, and the composer no longer confuses with jargon example chips.
describe('the atelier redesign', () => {
  it('starts with no jargon example chips, and a recorded-run entry instead', async () => {
    await mount()
    // composer-clarity: no example-need chips; the field starts empty.
    expect(document.querySelectorAll('.examples').length).toBe(0)
    expect(document.querySelector<HTMLTextAreaElement>('#brief')?.value).toBe('')
    // Keyless demo mode keeps one recorded-run entry so the site is not mute.
    const recorded = document.querySelector<HTMLButtonElement>('.recorded-run')
    expect(recorded, 'the recorded-run entry is missing').not.toBeNull()
    expect(recorded?.textContent ?? '').toContain('enregistré')
  })

  it('explains the workshop before any run, without faking a run', async () => {
    await mount()
    // scene-legibility: an intro naming the three beats, not a void.
    const intro = document.querySelector('.intro')
    expect(intro, 'the scene intro is missing before a run').not.toBeNull()
    expect(intro?.textContent ?? '').toContain('Forke la timeline')
    expect(intro?.textContent ?? '').toContain('intra-runtime')
    // No fake run content before a run: no application frame, no skeleton.
    expect(document.querySelector('.live-app')).toBeNull()
    expect(document.querySelector('.skeleton')).toBeNull()
  })

  it('yields the intro to the graph once the run starts', async () => {
    await mount()
    await startRun()
    // Once started, the intro is gone and the graph is what the scene shows.
    expect(document.querySelector('.intro')).toBeNull()
    expect(document.querySelectorAll('.node').length).toBeGreaterThan(0)
  })

  it('surfaces the fork with its why on a forkable run', async () => {
    await mount()
    await startRun()
    // scene-legibility: the fork gesture is present with a one-line reason.
    expect(document.querySelector('.fork-start')).not.toBeNull()
    const why = document.querySelector('.fork-why')?.textContent ?? ''
    expect(why).toContain('trajectoire qui a planté')
  })
})
