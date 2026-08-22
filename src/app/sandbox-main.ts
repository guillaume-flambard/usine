// The bridge. It runs inside the sandboxed frame and is the only code there.
//
// Its whole job is to turn declarative markup into calls, and calls into
// displayed answers. It never evaluates anything, never fetches anything, and
// holds no state beyond what is on screen — the session lives in the host,
// precisely so that a replacement costs nothing.
//
// Everything it receives is treated as hostile: the host is a page it does not
// control, and any window may post to it.

import { sanitize } from './sanitize'
import { readToFrame, type FromFrame } from './protocol'

const root = document.getElementById('screen')
if (root === null) throw new Error("le cadre n'a pas de racine")

/** Behaviour names currently answered, with the version serving. */
let live = new Map<string, number>()
/** Slot names the current screen declares, live or not. */
let declared: readonly string[] = []
let nextCall = 1
/** Which output slot is waiting for which call. */
const awaiting = new Map<number, string>()

const say = (message: FromFrame): void => {
  parent.postMessage(message, '*')
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  // The host is the only correspondent. Anything else is ignored in silence:
  // an unexpected sender is not an incident to report, it is a non-event.
  if (event.source !== parent) return
  const message = readToFrame(event.data)
  if (message === undefined) return

  if (message.type === 'mount-screen') {
    mount(message.markup, message.revision)
    return
  }
  if (message.type === 'slots-changed') {
    live = new Map(message.live.map((slot) => [slot.name, slot.version]))
    paintSlots()
    return
  }
  if (message.type === 'call-settled') {
    settle(message.call, message.output, message.failure, message.version)
  }
})

function mount(markup: string, revision: number): void {
  const { fragment, slots, refused } = sanitize(markup, document)
  declared = slots
  awaiting.clear()
  root!.replaceChildren(fragment)
  wire()
  paintSlots()
  say({ type: 'screen-mounted', revision, slots, refused })
}

/** Attaches the only listeners in this document. Agents attach none. */
function wire(): void {
  for (const button of root!.querySelectorAll<HTMLElement>('[data-invoke]')) {
    button.addEventListener('click', () => request(button))
  }
  // Enter in a single-line field is the gesture people make without thinking.
  for (const field of root!.querySelectorAll<HTMLElement>('input[data-field]')) {
    field.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key !== 'Enter') return
      const button = root!.querySelector<HTMLElement>('[data-invoke]:not([disabled])')
      if (button !== null) request(button)
    })
  }
}

function request(button: HTMLElement): void {
  const name = button.getAttribute('data-invoke') ?? ''
  if (name.length === 0 || !live.has(name)) return
  const call = nextCall
  nextCall += 1

  const target = outputFor(name)
  if (target !== null) {
    target.removeAttribute('data-failed')
    target.textContent = '…'
    awaiting.set(call, name)
  }
  say({ type: 'call-requested', call, name, input: inputFor(button) })
}

/**
 * The input a command sends: the nearest field, looking outward from the
 * button. A screen with one field and one button — the common case — needs no
 * rule at all; a screen with several sections gets the field of its own
 * section rather than the first on the page.
 */
function inputFor(button: HTMLElement): string {
  const own = button.getAttribute('data-field')
  if (own !== null) return valueOf(root!.querySelector(`[data-field="${cssEscape(own)}"]`))

  let scope: HTMLElement | null = button.parentElement
  while (scope !== null && scope !== root) {
    const field = scope.querySelector('[data-field]')
    if (field !== null) return valueOf(field)
    scope = scope.parentElement
  }
  return valueOf(root!.querySelector('[data-field]'))
}

const valueOf = (element: Element | null): string => {
  if (element === null) return ''
  const field = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  return typeof field.value === 'string' ? field.value : (element.textContent ?? '')
}

/** `CSS.escape` is not everywhere; a name is already constrained to be safe. */
const cssEscape = (value: string): string => value.replace(/["\\]/g, '')

const outputFor = (name: string): HTMLElement | null =>
  root!.querySelector<HTMLElement>(`[data-output="${cssEscape(name)}"]`)

function settle(call: number, output?: string, failure?: string, version?: number): void {
  const name = awaiting.get(call)
  if (name === undefined) return
  awaiting.delete(call)
  const target = outputFor(name)
  if (target === null) return

  if (failure !== undefined) {
    target.setAttribute('data-failed', 'true')
    target.textContent = failure
    return
  }
  target.removeAttribute('data-failed')
  target.textContent =
    output === undefined || output.length === 0 ? '(aucune réponse)' : output
  if (version !== undefined) target.setAttribute('data-version', String(version))
}

/**
 * Shows which commands are live and which are not.
 *
 * This is the reactive dependency made visible to someone who has never heard
 * of one: a command whose behaviour does not exist yet is inert and says so,
 * and it lights up on its own the moment an agent publishes it.
 */
function paintSlots(): void {
  for (const button of root!.querySelectorAll<HTMLElement>('[data-invoke]')) {
    const name = button.getAttribute('data-invoke') ?? ''
    const version = live.get(name)
    const inert = version === undefined

    button.toggleAttribute('disabled', inert)
    button.setAttribute('aria-disabled', String(inert))
    if (version !== undefined) button.setAttribute('data-version', String(version))
    else button.removeAttribute('data-version')

    const note = noteFor(button)
    note.textContent = inert ? 'en construction' : ''
  }
  for (const name of declared) {
    const target = outputFor(name)
    if (target === null || target.textContent !== '') continue
    target.textContent = live.has(name) ? '' : 'en attente du comportement…'
  }
}

/** The bridge's own element, kept apart from anything an agent wrote. */
function noteFor(button: HTMLElement): HTMLElement {
  const existing = button.nextElementSibling
  if (existing !== null && existing.classList.contains('slot-note')) {
    return existing as HTMLElement
  }
  const note = document.createElement('span')
  note.className = 'slot-note'
  button.insertAdjacentElement('afterend', note)
  return note
}

say({ type: 'frame-ready' })
