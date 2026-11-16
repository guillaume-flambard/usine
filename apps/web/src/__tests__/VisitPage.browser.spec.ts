/**
 * The public visit (/visite): a recorded run replayed with no account, no
 * model and no call to the service. A decision stays in the page.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import ui from '@nuxt/ui/vue-plugin'
import VisitPage from '../components/VisitPage.vue'
import type { RunDetail } from '../chat/runs'
import '../assets/main.css'

const ev = (kind: string, at: number, node: string | null, data: object = {}) => ({
  kind,
  at,
  node,
  data,
})

const RUN = {
  thread_id: 'rec',
  title: 'Lis le README',
  status: 'waiting',
  created_at: '2026-11-16T14:06:55Z',
  turns: 1,
  history: [
    {
      brief: 'Lis le README et propose une issue',
      answer: 'Le build attend un run **push**.',
      events: [
        ev('run-started', 0, null),
        ev('node-started', 0.05, 'supervisor', { taskId: 't1' }),
        ev('node-finished', 0.1, 'supervisor', { taskId: 't1', subtasks: ['a'] }),
        ev('node-started', 0.15, 'specialist', { taskId: 't2', task: 'a' }),
        ev('node-finished', 0.2, 'specialist', { taskId: 't2' }),
        ev('node-started', 0.25, 'synthesize', { taskId: 't3' }),
        ev('node-finished', 0.3, 'synthesize', { taskId: 't3', proposed: 1 }),
        ev('node-started', 0.35, 'human_gate', { taskId: 't4' }),
        ev('gate-opened', 0.4, 'human_gate', {
          taskId: 't4',
          gate: {
            actions: [
              {
                kind: 'external_write',
                target: 'github/issue_write',
                justification: 'proposée',
                preview: '{"title": "CI"}',
              },
            ],
            notice: 'Revenir en arrière restaure l’état du run, pas le monde.',
          },
        }),
      ],
    },
  ],
} as unknown as RunDetail

afterEach(() => vi.restoreAllMocks())

describe('the public visit', () => {
  it('replays the recorded run to the consent, and keeps the decision in the page', async () => {
    const calls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      calls.push(String(input))
      return Response.json(RUN)
    })
    await render(VisitPage, { global: { plugins: [ui] } })

    // The one sentence says what the tool does, before anything moves.
    expect(document.querySelector('h1')?.textContent).toContain('rien ne part sans votre accord')
    await expect
      .poll(() => document.querySelector('[data-visit-steps] [aria-current="step"]')?.textContent, {
        timeout: 5000,
      })
      .toContain('Votre accord')
    await expect.poll(() => document.querySelector('[data-gate-approve]')).not.toBeNull()

    await userEvent.click(document.querySelector('[data-gate-approve]') as HTMLElement)
    await expect
      .poll(() => document.querySelector('[data-visit-sandbox]')?.textContent ?? '')
      .toContain('rien n’est parti')
    // No account, no model, no service: the recorded run is the only fetch.
    expect(calls).toEqual(['/visite/run.json'])
  })
})
