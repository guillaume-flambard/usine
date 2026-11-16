/**
 * Scène divergente (MEM-25) dans un vrai navigateur : fork depuis un run,
 * deux panneaux côte à côte (graphe + porte chacun), bandeau de comparaison,
 * et validation d'une branche. Vérifié aux 4 largeurs cibles sans
 * défilement horizontal.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import ui from '@nuxt/ui/vue-plugin'
import App from '../App.vue'
import { createAppRouter } from '../router'
import type { RunEventPayload } from '../contracts/ui-stream'
import '../assets/main.css'

const ev = (
  kind: RunEventPayload['kind'],
  at: number,
  node: string | null,
  data: Record<string, unknown> = {},
): RunEventPayload => ({
  kind,
  at,
  node,
  data,
})

// Run original : se termine sans porte.
const ORIGINAL_STREAM = [
  { type: 'start' as const, messageId: 'a1', messageMetadata: { threadId: 'run-1' } },
  { type: 'data-run-event' as const, data: ev('run-started', 0, null) },
  {
    type: 'data-run-event' as const,
    data: ev('node-started', 0.1, 'supervisor', { taskId: 't1' }),
  },
  {
    type: 'data-run-event' as const,
    data: ev('node-finished', 0.2, 'supervisor', { taskId: 't1' }),
  },
  {
    type: 'data-run-event' as const,
    data: ev('node-started', 0.3, 'specialist', { taskId: 't2' }),
  },
  {
    type: 'data-run-event' as const,
    data: ev('node-finished', 0.4, 'specialist', { taskId: 't2' }),
  },
  { type: 'data-run-event' as const, data: ev('run-finished', 0.5, null, { outcome: 'ok' }) },
  { type: 'text-start' as const, id: 'x' },
  { type: 'text-delta' as const, id: 'x', delta: 'Note prete.' },
  { type: 'text-end' as const, id: 'x' },
  { type: 'finish' as const, finishReason: 'stop' },
]

// Branche forcee : termine sans porte, avec une reponse differente.
const BRANCH_STREAM = [
  { type: 'start' as const, messageId: 'a2', messageMetadata: { threadId: 'run-2' } },
  { type: 'data-run-event' as const, data: ev('run-started', 0, null) },
  {
    type: 'data-run-event' as const,
    data: ev('node-started', 0.1, 'supervisor', { taskId: 't1' }),
  },
  {
    type: 'data-run-event' as const,
    data: ev('node-finished', 0.2, 'supervisor', { taskId: 't1' }),
  },
  {
    type: 'data-run-event' as const,
    data: ev('node-started', 0.3, 'specialist', { taskId: 't2' }),
  },
  {
    type: 'data-run-event' as const,
    data: ev('node-finished', 0.4, 'specialist', { taskId: 't2' }),
  },
  { type: 'data-run-event' as const, data: ev('run-finished', 0.5, null, { outcome: 'ok' }) },
  { type: 'text-start' as const, id: 'x' },
  { type: 'text-delta' as const, id: 'x', delta: 'Branche validee.' },
  { type: 'text-end' as const, id: 'x' },
  { type: 'finish' as const, finishReason: 'stop' },
]

function sse(chunks: object[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
  })
}

const CHECKPOINTS = [
  { checkpoint_id: 'cp-1', step: -1, source: 'input', next: ['__start__'] },
  { checkpoint_id: 'cp-2', step: 1, source: 'loop', next: ['specialist'] },
]

const SPECIALISTS = {
  items: [
    {
      name: 'chat-model',
      identity: { name: 'chat:lab-fast', framework: 'langchain', framework_version: '1' },
    },
  ],
}

const FORK_STREAM = [
  'data: {"type": "start", "messageId": "a3", "messageMetadata": {"threadId": "run-2"}}',
  '',
  'data: [DONE]',
  '',
].join('\n')

const ORIGINAL_EVENTS: RunEventPayload[] = ORIGINAL_STREAM.filter(
  (c): c is { type: 'data-run-event'; data: RunEventPayload } => c.type === 'data-run-event',
).map((c) => c.data)
const BRANCH_EVENTS: RunEventPayload[] = BRANCH_STREAM.filter(
  (c): c is { type: 'data-run-event'; data: RunEventPayload } => c.type === 'data-run-event',
).map((c) => c.data)

async function stubApi() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url === '/health') return Response.json({ ready: true, demo: false })
    if (url === '/api/chat') return sse(ORIGINAL_STREAM)
    if (url.endsWith('/checkpoints')) return Response.json(CHECKPOINTS)
    if (url === '/api/specialists') return Response.json(SPECIALISTS)
    if (url.endsWith('/fork'))
      return new Response(FORK_STREAM, { headers: { 'content-type': 'text/event-stream' } })
    if (url.endsWith('/gate')) return sse(BRANCH_STREAM)
    if (url === '/api/runs/run-1') {
      return Response.json({
        thread_id: 'run-1',
        title: 'Run originale',
        status: 'done',
        created_at: '2026-11-15T00:30:00Z',
        turns: 1,
        history: [{ brief: 'une tache', answer: 'Note prete.', events: ORIGINAL_EVENTS }],
      })
    }
    if (url === '/api/runs/run-2') {
      return Response.json({
        thread_id: 'run-2',
        title: 'Branche forcee',
        status: 'done',
        created_at: '2026-11-15T00:35:00Z',
        turns: 1,
        history: [{ brief: 'une tache', answer: 'Branche validee.', events: BRANCH_EVENTS }],
      })
    }
    if (url.startsWith('/api/runs')) return Response.json({ items: [], next_cursor: null })
    return new Response('not found', { status: 404 })
  })
}

afterEach(() => vi.restoreAllMocks())

/** Envoyer un brief, attendre la fin du run, puis forker depuis ce run termine. */
async function forkFromRun() {
  const prompt = document.querySelector('[data-composer] textarea') as HTMLTextAreaElement
  await userEvent.fill(prompt, 'une tache')
  await userEvent.keyboard('{Enter}')

  // Le run original arrive et se termine.
  await expect.poll(() => document.querySelector('[data-scene]')).not.toBeNull()
  await expect
    .poll(() => document.querySelector('[data-scene-status]')?.textContent ?? '')
    .toContain('terminé')

  // Le bouton "Forker" est maintenant accessible.
  const forkBtn = document.querySelector('[data-fork-open]') as HTMLElement
  await userEvent.click(forkBtn)

  await expect.poll(() => document.querySelector('[data-fork-checkpoint]')).not.toBeNull()
  await userEvent.click(document.querySelector('[data-fork-confirm]') as HTMLElement)
}

describe('DivergentScene (MEM-25)', () => {
  it('affiche deux panneaux et un bandeau de comparaison après un fork', async () => {
    stubApi()
    await render(App, { global: { plugins: [createAppRouter(), ui] } })

    await forkFromRun()

    // Deux scènes, une par branche.
    await expect.poll(() => document.querySelectorAll('[data-scene]')).toHaveLength(2)
    // Bandeau de comparaison présent.
    expect(document.querySelector('[data-comparison-banner]')).not.toBeNull()
    // Les titres des deux panneaux sont distincts.
    expect(document.querySelectorAll('h2')).toHaveLength(2)
  })

  it('garde chaque panneau indépendant avec sa propre scène', async () => {
    stubApi()
    await render(App, { global: { plugins: [createAppRouter(), ui] } })

    await forkFromRun()

    await expect.poll(() => document.querySelectorAll('[data-scene]')).toHaveLength(2)
    // Chaque panneau a son propre titre.
    expect(document.querySelectorAll('h2')).toHaveLength(2)
  })

  it('montre la réponse de chaque branche, et revient à la conversation', async () => {
    stubApi()
    await render(App, { global: { plugins: [createAppRouter(), ui] } })

    await forkFromRun()
    await expect.poll(() => document.querySelectorAll('[data-branch-answer]')).toHaveLength(2)

    await userEvent.click(document.querySelector('[data-divergent-back]') as HTMLElement)
    await expect.poll(() => document.querySelector('[data-divergent-scene]')).toBeNull()
    await expect.poll(() => document.querySelector('[data-composer]')).not.toBeNull()
  })

  it('ne défile pas horizontalement aux quatre largeurs cibles', async () => {
    stubApi()
    await render(App, { global: { plugins: [createAppRouter(), ui] } })

    await forkFromRun()
    await expect.poll(() => document.querySelectorAll('[data-scene]')).toHaveLength(2)

    const body = document.body
    expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth + 1)
  })
})
