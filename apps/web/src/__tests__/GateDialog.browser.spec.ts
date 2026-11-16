/**
 * The human gate in the page (MEM-21): the three decisions, the keyboard alone,
 * and an accessibility audit of the open dialog. The page is the real App; only
 * `fetch` is replaced, answering in the stream shapes of MEM-14 and MEM-20.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import axe from 'axe-core'
import ui from '@nuxt/ui/vue-plugin'
import App from '../App.vue'
import { createAppRouter } from '../router'
import '../assets/main.css'

const ACTION = {
  kind: 'send',
  target: '#annonces',
  justification: 'La tâche demande de publier.',
  preview: 'La v2 est sortie.',
}
const NOTICE =
  "Revenir en arrière restaure l'état du run, pas le monde : une action déjà exécutée n'est pas défaite."

function sse(chunks: object[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
  })
}

const ev = (kind: string, at: number, node: string | null, data: object = {}) => ({
  type: 'data-run-event',
  data: { kind, at, node, data },
})

const GATE_STREAM = [
  { type: 'start', messageId: 'a1', messageMetadata: { threadId: 'chat-g' } },
  ev('run-started', 0, null),
  ev('node-started', 0.1, 'synthesize', { taskId: 't1' }),
  ev('node-finished', 0.2, 'synthesize', { taskId: 't1' }),
  ev('node-started', 0.3, 'human_gate', { taskId: 't2' }),
  ev('gate-opened', 0.3, 'human_gate', {
    taskId: 't2',
    gate: { actions: [ACTION], notice: NOTICE },
  }),
  { type: 'text-start', id: 'x' },
  { type: 'text-delta', id: 'x', delta: 'Note prête.' },
  { type: 'text-end', id: 'x' },
  { type: 'finish', finishReason: 'other' },
]

const resumeStream = (decision: string) => [
  { type: 'start', messageId: 'a2', messageMetadata: { threadId: 'chat-g' } },
  ev('run-started', 0, null, { resumed: true }),
  ev('node-started', 0.1, 'human_gate', { taskId: 'r1-1' }),
  ev('gate-decided', 0.1, 'human_gate', { taskId: 'r1-1', decision }),
  ...(decision === 'reject'
    ? []
    : [
        ev('node-started', 0.2, 'act', { taskId: 'r1-2' }),
        ev('node-finished', 0.3, 'act', { taskId: 'r1-2' }),
      ]),
  ev('run-finished', 0.4, null, { outcome: 'ok' }),
  { type: 'finish', finishReason: 'stop' },
]

function stubApi() {
  const gateBodies: Record<string, unknown>[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    // A signed-in visitor: the door (App.vue) lets them in.
    if (url === '/auth/session') return Response.json({ authenticated: true })
    if (url === '/api/chat') return sse(GATE_STREAM)
    if (url.endsWith('/gate')) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      gateBodies.push(body)
      return sse(resumeStream(String(body.decision)))
    }
    if (url.startsWith('/api/runs')) return Response.json({ items: [], next_cursor: null })
    return new Response('not found', { status: 404 })
  })
  return gateBodies
}

const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null
const q = (selector: string) => document.querySelector(selector) as HTMLElement

/**
 * axe reads colours at the instant it runs. Switching theme starts the
 * library's `transition-colors`; measuring during it reports a frame nobody
 * ever sees. Poll until two readings in a row agree.
 */
async function colourSettled() {
  let previous = ''
  await expect
    .poll(() => {
      const current = getComputedStyle(q('[data-gate-reject] span')).color
      const stable = current === previous
      previous = current
      return stable
    })
    .toBe(true)
}

async function openGate() {
  await render(App, { global: { plugins: [createAppRouter(), ui] } })
  // The door (App.vue) asks for the session before showing the atelier.
  await expect
    .poll(() => document.querySelector('[data-shell]')?.getAttribute('data-door'))
    .toBe('in')
  await userEvent.fill(q('[data-composer] textarea'), 'publie la note')
  await userEvent.keyboard('{Enter}')
  await expect.poll(dialog).not.toBeNull()
}

afterEach(() => vi.restoreAllMocks())

describe('human gate dialog', () => {
  it('opens as a real dialog when the stream announces the gate', async () => {
    stubApi()
    await openGate()
    const box = dialog()!
    expect(box.textContent).toContain('Envoi vers #annonces')
    expect(box.textContent).toContain('La v2 est sortie.')
    expect(box.textContent).toContain('pas le monde')
    // The rest of the page cannot be reached while the decision is open.
    expect(q('[data-shell]').hasAttribute('inert')).toBe(true)
    expect(box.contains(document.activeElement)).toBe(true)
  })

  it('approves, and the run resumes in the same scene', async () => {
    const bodies = stubApi()
    await openGate()
    await userEvent.click(q('[data-gate-approve]'))

    await expect.poll(() => bodies).toEqual([{ decision: 'approve' }])
    await expect.poll(() => q('[data-scene-status]')?.textContent ?? '').toContain('Run terminé')
    expect(q('[data-conversation]').textContent).toContain('Décision : approuver.')
    // One gate node, finished: the resumed run continued the scene.
    expect(document.querySelectorAll('[data-node="human_gate"]')).toHaveLength(1)
    expect(q('[data-node="act"]').getAttribute('data-node-state')).toBe('finished')
    expect(q('[data-shell]').hasAttribute('inert')).toBe(false)
  })

  it('rejects only with a reason', async () => {
    const bodies = stubApi()
    await openGate()
    await userEvent.click(q('[data-gate-reject]'))
    expect(q('[data-gate-confirm-reject]').hasAttribute('disabled')).toBe(true)
    await userEvent.fill(
      q('[data-gate-reason] textarea, textarea[data-gate-reason]'),
      'pas avant la recette',
    )
    await userEvent.click(q('[data-gate-confirm-reject]'))

    await expect
      .poll(() => bodies)
      .toEqual([{ decision: 'reject', reason: 'pas avant la recette' }])
    await expect
      .poll(() => q('[data-conversation]').textContent)
      .toContain('Motif : pas avant la recette')
    expect(document.querySelector('[data-node="act"]')).toBeNull()
  })

  it('edits then approves the edited action', async () => {
    const bodies = stubApi()
    await openGate()
    await userEvent.click(q('[data-gate-edit]'))
    const field = q('[data-gate-preview-input] textarea, textarea[data-gate-preview-input]')
    await userEvent.fill(field, 'La v2 sort lundi.')
    await userEvent.click(q('[data-gate-confirm-edit]'))

    await expect
      .poll(() => bodies)
      .toEqual([{ decision: 'edit', actions: [{ ...ACTION, preview: 'La v2 sort lundi.' }] }])
  })

  it('works with the keyboard alone', async () => {
    const bodies = stubApi()
    await openGate()
    // Escape closes the dialog and gives the page back.
    await userEvent.keyboard('{Escape}')
    await expect.poll(dialog).toBeNull()
    expect(q('[data-shell]').hasAttribute('inert')).toBe(false)

    // Reopen from the scene, then Tab to "Approuver" and press Enter.
    q('[data-gate-open]').focus()
    await userEvent.keyboard('{Enter}')
    await expect.poll(dialog).not.toBeNull()
    for (let i = 0; i < 10 && !document.activeElement?.hasAttribute('data-gate-approve'); i++) {
      await userEvent.keyboard('{Tab}')
    }
    expect(document.activeElement?.hasAttribute('data-gate-approve')).toBe(true)
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => bodies).toEqual([{ decision: 'approve' }])
  })

  it('passes an accessibility audit in both themes, with no critical or serious issue', async () => {
    stubApi()
    await openGate()
    // axe reads computed colours: measure once the entrance transition is
    // over, otherwise a half-transparent frame reads as a contrast failure.
    await expect.poll(() => getComputedStyle(dialog()!).opacity).toBe('1')

    for (const theme of ['clair', 'sombre']) {
      document.documentElement.classList.toggle('dark', theme === 'sombre')
      await colourSettled()
      const result = await axe.run(dialog()!, { resultTypes: ['violations'] })
      const blocking = result.violations
        .filter((v) => v.impact === 'critical' || v.impact === 'serious')
        .map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
      // The theme is named: a failure says which one to fix.
      expect(blocking, `thème ${theme}`).toEqual([])
    }
    document.documentElement.classList.remove('dark')
  })
})
