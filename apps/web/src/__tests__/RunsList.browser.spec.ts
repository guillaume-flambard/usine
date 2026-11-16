/**
 * Earlier runs (MEM-18): the sidebar lists them, and opening one brings back its
 * conversation and replays its scene. Only `fetch` is replaced, with answers in
 * the shapes of services/api/openapi.json.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import ui from '@nuxt/ui/vue-plugin'
import App from '../App.vue'
import { createAppRouter } from '../router'
import type { RunDetail, RunPage } from '../chat/runs'
import '../assets/main.css'

const RUN: RunDetail = {
  thread_id: 'chat-1',
  title: 'relire les portes',
  status: 'done',
  created_at: '2026-11-15T00:30:00Z',
  turns: 1,
  history: [
    {
      brief: 'relire les portes',
      answer: 'fait : relire les portes',
      events: [
        { kind: 'run-started', at: 0, node: null, data: {} },
        { kind: 'node-started', at: 0.1, node: 'supervisor', data: { taskId: 't1' } },
        {
          kind: 'node-finished',
          at: 0.4,
          node: 'supervisor',
          data: { taskId: 't1', subtasks: ['relire'] },
        },
        { kind: 'run-finished', at: 0.5, node: null, data: { outcome: 'ok' } },
      ],
    },
  ],
}

function stubApi(page: RunPage) {
  const calls: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    // The panel asks /health on mount for the recorded showcase run (MEM-24): not the
    // subject here.
    if (url !== '/health' && url !== '/auth/session') calls.push(url)
    // A signed-in visitor: the door (App.vue) lets them in.
    if (url === '/auth/session') return Response.json({ authenticated: true })
    if (url.startsWith('/api/runs?')) return Response.json(page)
    if (url === '/api/runs/chat-1') return Response.json(RUN)
    return new Response('not found', { status: 404 })
  })
  return calls
}

afterEach(() => vi.restoreAllMocks())

describe('earlier runs', () => {
  it('lists the runs and reopens one with its scene', async () => {
    const calls = stubApi({ items: [RUN], next_cursor: null })
    await render(App, { global: { plugins: [createAppRouter(), ui] } })
    // The door (App.vue) asks for the session before showing the atelier.
    await expect
      .poll(() => document.querySelector('[data-shell]')?.getAttribute('data-door'))
      .toBe('in')

    // The sidebar lists the runs as soon as the atelier opens.
    await expect.poll(() => document.querySelector('[data-run="chat-1"]')).not.toBeNull()
    expect(calls).toContain('/api/runs?limit=20')
    const item = document.querySelector('[data-run="chat-1"]') as HTMLElement
    expect(item.textContent).toContain('relire les portes')
    expect(item.textContent).toContain('terminé')

    // Opening a run remounts the atelier: the list must not empty itself on the
    // way (it flickered on every click, 16 November 2026).
    const counts: number[] = []
    let sampling = true
    const sample = () => {
      counts.push(document.querySelectorAll('[data-run]').length)
      if (sampling) requestAnimationFrame(sample)
    }
    sample()
    await userEvent.click(item)
    await expect
      .poll(() => document.querySelector('[data-conversation]')?.textContent ?? '')
      .toContain('fait : relire les portes')
    sampling = false
    expect(counts.every((n) => n > 0)).toBe(true)
    // The scene replays the archived events.
    expect(
      document.querySelector('[data-node="supervisor"]')?.getAttribute('data-node-state'),
    ).toBe('finished')
    expect(document.querySelector('[data-scene-status]')?.textContent).toContain('Run terminé')
  })

  it('says when there is no run yet', async () => {
    stubApi({ items: [], next_cursor: null })
    await render(App, { global: { plugins: [createAppRouter(), ui] } })
    // The door (App.vue) asks for the session before showing the atelier.
    await expect
      .poll(() => document.querySelector('[data-shell]')?.getAttribute('data-door'))
      .toBe('in')
    await expect.poll(() => document.querySelector('[data-runs-empty]')).not.toBeNull()
  })

  it('filters the runs by title', async () => {
    stubApi({
      items: [RUN, { ...RUN, thread_id: 'chat-2', title: 'annonce v2' }],
      next_cursor: null,
    })
    await render(App, { global: { plugins: [createAppRouter(), ui] } })
    await expect.poll(() => document.querySelectorAll('[data-run]').length).toBe(2)
    await userEvent.fill(document.querySelector('[data-runs-search]') as HTMLElement, 'annonce')
    await expect.poll(() => document.querySelectorAll('[data-run]').length).toBe(1)
    expect(document.querySelector('[data-run="chat-2"]')).not.toBeNull()
  })
})
