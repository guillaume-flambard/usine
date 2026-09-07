// The frame and its bridge, end to end in a real browser.
//
// Two harnesses, deliberately. Isolation is asserted with the real `sandbox`
// attribute — and that opaque origin is precisely what makes the frame's
// document unreachable, so the interaction path is driven through a
// same-origin frame instead. Testing both through one harness would mean
// weakening the isolation to observe it, which would prove nothing.
import { describe, expect, it, afterEach } from 'vitest'
import { createFrameHost, type FrameHost } from './frame-host'
import { createSession, type Interaction, type Session } from './session'
import type { Behaviour } from './behaviour'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// The frame is a real document fetched from the dev server: how long it takes
// to answer depends on what else the page loaded. Waiting on the fact rather
// than on a duration is what keeps this suite honest when the bundle grows.
async function waitFor(ready: () => boolean, timeout = 5000): Promise<void> {
  const deadline = Date.now() + timeout
  while (!ready()) {
    if (Date.now() > deadline) throw new Error('le cadre n’a pas répondu à temps')
    await wait(40)
  }
}

const behaviour = (name: string, version: number, answer: (input: string) => string): Behaviour => ({
  name,
  version,
  call: async (input) => ({ output: answer(input) }),
})

const SCREEN =
  '<h1>Compteur</h1>' +
  '<label for="t">Texte</label>' +
  '<textarea id="t" data-field="texte"></textarea>' +
  '<button data-invoke="compter">Compter</button>' +
  '<div data-output="compter"></div>'

interface Harness {
  frame: HTMLIFrameElement
  host: FrameHost
  session: Session
  inner: Document
  /** Every interaction the host handed back as an observation. */
  observations: Interaction[]
  set(next: { behaviours?: readonly Behaviour[]; screen?: { markup: string; revision: number } }): void
}

let open: Harness | undefined

afterEach(() => {
  open?.host.dispose()
  open?.frame.remove()
  open = undefined
})

/** A same-origin frame: the test can read what the bridge rendered. */
async function harness(initial: readonly Behaviour[]): Promise<Harness> {
  const frame = document.createElement('iframe')
  frame.src = '/sandbox.html'
  frame.style.cssText = 'width:600px;height:300px'
  document.body.appendChild(frame)

  let behaviours: readonly Behaviour[] = initial
  let screen = { markup: SCREEN, revision: 1 }
  const session = createSession()
  const observations: Interaction[] = []

  const host = createFrameHost({
    frame,
    behaviours: () => behaviours,
    screen: () => screen,
    session,
    onObservation: (interaction) => observations.push(interaction),
  })

  // The bridge announces itself; the host answers with the screen.
  await waitFor(() => frame.contentDocument?.querySelector('[data-invoke]') != null)
  const inner = frame.contentDocument
  if (inner === null) throw new Error('le cadre est inaccessible')

  const made: Harness = {
    frame,
    host,
    session,
    inner,
    observations,
    set(next) {
      if (next.behaviours !== undefined) behaviours = next.behaviours
      if (next.screen !== undefined) screen = next.screen
      host.sync()
    },
  }
  open = made
  return made
}

const button = (inner: Document) => inner.querySelector<HTMLButtonElement>('[data-invoke]')
const output = (inner: Document) => inner.querySelector('[data-output="compter"]')?.textContent ?? ''

describe('the sandboxed frame', () => {
  it('cannot reach the host page', async () => {
    const frame = document.createElement('iframe')
    frame.src = '/sandbox.html'
    frame.setAttribute('sandbox', 'allow-scripts')
    document.body.appendChild(frame)
    await wait(500)

    // An opaque origin: no document, no storage, no variables. If this ever
    // passes, `allow-same-origin` has crept into the attribute.
    expect(frame.contentDocument).toBeNull()
    frame.remove()
  })
})

describe('the bridge', () => {
  it('mounts a screen and reports what it refused', async () => {
    const reports: { refused: readonly string[] }[] = []
    const frame = document.createElement('iframe')
    frame.src = '/sandbox.html'
    document.body.appendChild(frame)
    const session = createSession()
    const host = createFrameHost({
      frame,
      behaviours: () => [],
      screen: () => ({ markup: `${SCREEN}<script>alert(1)</script>`, revision: 1 }),
      session,
      onMounted: (report) => reports.push(report),
    })
    await waitFor(() => reports.length > 0)

    expect(reports[0]?.refused).toContain('<script>')
    // Scoped to the screen: the frame's own bridge is a script too, and it is
    // ours. What must never appear is one inside what an agent wrote.
    expect(frame.contentDocument?.querySelector('#screen script')).toBeNull()
    expect(frame.contentDocument?.getElementById('screen')?.innerHTML ?? '').not.toContain('alert')
    host.dispose()
    frame.remove()
  })

  it('shows a slot as inert until its behaviour exists, then lights it up', async () => {
    const { inner, set } = await harness([])

    expect(button(inner)?.disabled).toBe(true)
    expect(inner.querySelector('.slot-note')?.textContent).toBe('en construction')

    set({ behaviours: [behaviour('compter', 1, (t) => String(t.length))] })
    await wait(120)

    expect(button(inner)?.disabled).toBe(false)
    expect(inner.querySelector('.slot-note')?.textContent).toBe('')
  })

  it('runs a call and shows the answer', async () => {
    const { inner, session } = await harness([
      behaviour('compter', 1, (text) => `${text.split(' ').length} mots`),
    ])
    await wait(120)

    const field = inner.querySelector<HTMLTextAreaElement>('[data-field]')
    if (field === null) throw new Error('pas de champ')
    field.value = 'trois mots ici'
    button(inner)?.click()
    await wait(200)

    expect(output(inner)).toBe('3 mots')
    expect(session.counts.interactions).toBe(1)
    expect(session.interactions[0]?.version).toBe(1)
  })

  it('keeps the session across a replacement, and the next call hits the new version', async () => {
    const { inner, session, set } = await harness([behaviour('compter', 1, () => 'v1')])
    await wait(120)

    button(inner)?.click()
    await wait(200)
    expect(output(inner)).toBe('v1')

    // The replacement, while the frame is mounted and the visitor is on it.
    set({ behaviours: [behaviour('compter', 2, () => 'v2')] })
    await wait(120)

    button(inner)?.click()
    await wait(200)

    expect(output(inner)).toBe('v2')
    // Nothing was reloaded, and nothing was lost: both calls are still there,
    // each carrying the version that answered it.
    expect(session.counts.interactions).toBe(2)
    expect(session.interactions.map((entry) => entry.version)).toEqual([1, 2])
  })

  it('goes inert again when the behaviour disappears', async () => {
    const { inner, set } = await harness([behaviour('compter', 1, () => 'ok')])
    await wait(120)
    expect(button(inner)?.disabled).toBe(false)

    set({ behaviours: [] })
    await wait(120)

    expect(button(inner)?.disabled).toBe(true)
    expect(inner.querySelector('.slot-note')?.textContent).toBe('en construction')
  })

  it('reposts a screen without losing the session', async () => {
    const { inner, session, set } = await harness([behaviour('compter', 1, () => 'ok')])
    await wait(120)
    button(inner)?.click()
    await wait(200)
    expect(session.counts.interactions).toBe(1)

    set({ screen: { markup: `<h2>Refait</h2>${SCREEN}`, revision: 2 } })
    await wait(300)

    expect(inner.querySelector('h2')?.textContent).toBe('Refait')
    // The screen is new, the session is not: it lives outside the frame.
    expect(session.counts.interactions).toBe(1)
    // And the slots were resent, so the new screen is not born inert.
    expect(button(inner)?.disabled).toBe(false)
  })

  it('reports every interaction as an observation, carrying the exchange', async () => {
    const { inner, observations } = await harness([
      behaviour('compter', 1, (text) => `${text.split(' ').length} mots`),
    ])
    await wait(120)

    const field = inner.querySelector<HTMLTextAreaElement>('[data-field]')
    if (field === null) throw new Error('pas de champ')
    field.value = 'trois mots ici'
    button(inner)?.click()
    await wait(200)

    // The observation is the recorded interaction itself, not a bare ping: an
    // agent needs the input and the answer to decide whether to recompose.
    expect(observations).toHaveLength(1)
    expect(observations[0]?.name).toBe('compter')
    expect(observations[0]?.input).toBe('trois mots ici')
    expect(observations[0]?.output).toBe('3 mots')
    expect(observations[0]?.version).toBe(1)
  })

  it('says so when a behaviour fails rather than leaving the slot blank', async () => {
    const failing: Behaviour = {
      name: 'compter',
      version: 1,
      call: async () => ({ failure: 'arrêté : plus de 2000 ms sans réponse' }),
    }
    const { inner, session, observations } = await harness([failing])
    await wait(120)

    button(inner)?.click()
    await wait(200)

    expect(output(inner)).toContain('arrêté')
    expect(session.interactions[0]?.failure).toContain('arrêté')
    // A failed call is still an observation, and it carries the failure: a
    // behaviour that broke on the visitor's input is exactly a reason to react.
    expect(observations[0]?.failure).toContain('arrêté')
  })
})
