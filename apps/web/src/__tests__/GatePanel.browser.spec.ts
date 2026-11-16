/**
 * The human gate in the page (MEM-21), inline in the inspector (MEM-86): the
 * three decisions, the A/C/R keys, and an accessibility audit of the gate card.
 * The page is the real App; only `fetch` is replaced, answering in the stream
 * shapes of MEM-14 and MEM-20.
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

function stubApi(options: { refuseGate?: boolean } = {}) {
  const gateBodies: Record<string, unknown>[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    // A signed-in visitor: the door (App.vue) lets them in.
    if (url === '/auth/session') return Response.json({ authenticated: true })
    if (url === '/api/chat') return sse(GATE_STREAM)
    if (url.endsWith('/gate') && options.refuseGate)
      return Response.json({ detail: 'Connexion requise pour décider.' }, { status: 401 })
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

const q = (selector: string) => document.querySelector(selector) as HTMLElement
const card = () => document.querySelector('[data-inspector] [data-gate-card]') as HTMLElement | null

async function openGate() {
  await render(App, { global: { plugins: [createAppRouter(), ui] } })
  // The door (App.vue) asks for the session before showing the atelier.
  await expect
    .poll(() => document.querySelector('[data-shell]')?.getAttribute('data-door'))
    .toBe('in')
  await userEvent.fill(q('[data-composer] textarea'), 'publie la note')
  await userEvent.keyboard('{Enter}')
  await expect.poll(card).not.toBeNull()
  // The card takes the focus once the run stops at it.
  await expect.poll(() => document.activeElement === card()).toBe(true)
}

afterEach(() => vi.restoreAllMocks())

describe('human gate, inline in the inspector', () => {
  it('shows the action, its exact arguments and the reminder when the stream announces it', async () => {
    stubApi()
    await openGate()
    const gate = q('[data-inspector] [data-gate]')
    expect(gate.textContent).toContain('Envoi vers #annonces')
    expect(q('[data-gate-preview]').textContent).toContain('La v2 est sortie.')
    expect(q('[data-gate-notice]').textContent).toContain('pas le monde')
    expect(card()!.textContent).toContain('J’envoie ce message')
    expect(q('[data-status]').textContent).toContain('À la porte')
  })

  it('gives the choice back when the decision is refused, never says « Approuvé »', async () => {
    // Audit, 16 November 2026: a 401 on the gate left « Approuvé » on screen
    // beside a failed run and a waiting scene.
    stubApi({ refuseGate: true })
    await openGate()
    await userEvent.click(q('[data-gate-approve]'))

    await expect
      .poll(() => q('[data-gate-done]').textContent ?? '')
      .toContain('La décision n’est pas partie')
    expect(q('[data-gate-done]').textContent).not.toContain('Approuvé')
    expect(q('[data-gate-approve]')).not.toBeNull()
    expect(q('[data-chat-error]').textContent).toContain('reconnectez-vous')
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
    // The knot tightens on approval, and the card says what happened.
    expect(q('[data-node="human_gate"]').classList.contains('tight')).toBe(true)
    expect(q('[data-gate-done]').textContent).toContain('Approuvé')
  })

  it('rejects only with a reason', async () => {
    const bodies = stubApi()
    await openGate()
    await userEvent.click(q('[data-gate-reject]'))
    expect(q('[data-gate-confirm-reject]').hasAttribute('disabled')).toBe(true)
    await userEvent.fill(q('textarea[data-gate-reason]'), 'pas avant la recette')
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
    await userEvent.fill(q('textarea[data-gate-preview-input]'), 'La v2 sort lundi.')
    await userEvent.click(q('[data-gate-confirm-edit]'))

    await expect
      .poll(() => bodies)
      .toEqual([{ decision: 'edit', actions: [{ ...ACTION, preview: 'La v2 sort lundi.' }] }])
  })

  it('decides with A from the keyboard', async () => {
    const bodies = stubApi()
    await openGate()
    await userEvent.keyboard('a')
    await expect.poll(() => bodies).toEqual([{ decision: 'approve' }])
  })

  it('opens the correction with C and the rejection with R, focus in the field', async () => {
    const bodies = stubApi()
    await openGate()
    await userEvent.keyboard('c')
    await expect.poll(() => q('[data-gate]').getAttribute('data-gate-mode')).toBe('edit')
    expect(document.activeElement?.hasAttribute('data-gate-preview-input')).toBe(true)
    // Typing in the field is text, never a decision.
    await userEvent.keyboard('ra')
    await userEvent.click(q('[data-gate-back]'))
    card()!.focus()
    await userEvent.keyboard('r')
    await expect.poll(() => q('[data-gate]').getAttribute('data-gate-mode')).toBe('reject')
    expect(document.activeElement?.hasAttribute('data-gate-reason')).toBe(true)
    expect(bodies).toEqual([])
  })

  it('ignores the keys while the person types a brief', async () => {
    const bodies = stubApi()
    await openGate()
    q('[data-composer] textarea').focus()
    await userEvent.keyboard('a')
    await new Promise((r) => setTimeout(r, 100))
    expect(bodies).toEqual([])
  })

  it('reaches the gate from the knot in the graph', async () => {
    stubApi()
    await openGate()
    q('[data-composer] textarea').focus()
    await userEvent.click(q('[data-gate-open]'))
    await expect.poll(() => document.activeElement === card()).toBe(true)
  })

  it('passes an accessibility audit, with no critical or serious issue', async () => {
    stubApi()
    await openGate()
    const result = await axe.run(q('[data-inspector]'), { resultTypes: ['violations'] })
    const blocking = result.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
    expect(blocking).toEqual([])
  })
})
