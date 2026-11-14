/**
 * Earlier runs (MEM-18): the sheet lists them, and opening one brings back its
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
    calls.push(url)
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

    await userEvent.click(document.querySelector('[data-runs-trigger]') as HTMLElement)
    await expect.poll(() => document.querySelector('[data-run="chat-1"]')).not.toBeNull()
    expect(calls[0]).toBe('/api/runs?limit=20')
    const item = document.querySelector('[data-run="chat-1"]') as HTMLElement
    expect(item.textContent).toContain('relire les portes')
    expect(item.textContent).toContain('terminé')

    await userEvent.click(item)
    await expect
      .poll(() => document.querySelector('[data-conversation]')?.textContent ?? '')
      .toContain('fait : relire les portes')
    // The scene replays the archived events.
    expect(
      document.querySelector('[data-node="supervisor"]')?.getAttribute('data-node-state'),
    ).toBe('finished')
    expect(document.querySelector('[data-scene-status]')?.textContent).toContain('Run terminé')
  })

  it('says when there is no run yet', async () => {
    stubApi({ items: [], next_cursor: null })
    await render(App, { global: { plugins: [createAppRouter(), ui] } })
    await userEvent.click(document.querySelector('[data-runs-trigger]') as HTMLElement)
    await expect.poll(() => document.querySelector('[data-runs-empty]')).not.toBeNull()
  })
})
