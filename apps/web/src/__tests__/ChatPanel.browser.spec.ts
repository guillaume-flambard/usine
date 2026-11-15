/**
 * The chat states (MEM-15), in a real browser, with the real DefaultChatTransport
 * of ai@7.0.165. Only `fetch` is replaced: the test writes the UI message stream
 * chunk by chunk, in the shape `POST /api/chat` sends (MEM-14).
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import ui from '@nuxt/ui/vue-plugin'
import { DefaultChatTransport } from 'ai'
import { chatTransport, SERVICE_UNREACHABLE } from '../chat/transport'
import ChatPanel from '../components/ChatPanel.vue'
import { createAppRouter } from '../router'
import { UI_STREAM_HEADER, UI_STREAM_VERSION } from '../contracts/ui-stream'
import '../assets/main.css'

/** A response body the test feeds by hand, like a run in progress. */
function controlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) })
  const encoder = new TextEncoder()
  return {
    body,
    send(chunk: object | '[DONE]') {
      const data = chunk === '[DONE]' ? chunk : JSON.stringify(chunk)
      controller.enqueue(encoder.encode(`data: ${data}\n\n`))
    },
    close: () => controller.close(),
  }
}

async function setup() {
  const stream = controlledStream()
  const requests: unknown[] = []
  let respond!: () => void
  const responded = new Promise<void>((resolve) => (respond = resolve))
  const transport = new DefaultChatTransport({
    api: '/api/chat',
    fetch: async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)))
      await responded
      return new Response(stream.body, {
        headers: {
          'content-type': 'text/event-stream',
          [UI_STREAM_HEADER]: UI_STREAM_VERSION,
        },
      })
    },
  })
  const screen = await render(ChatPanel, {
    props: { transport },
    global: { plugins: [createAppRouter(), ui] },
  })
  return { screen, stream, requests, respond }
}

const root = () => document.querySelector('[data-chat]') as HTMLElement
const state = () => root().dataset.chatState

async function send(text: string) {
  const prompt = document.querySelector('[data-composer] textarea') as HTMLTextAreaElement
  await userEvent.fill(prompt, text)
  await userEvent.keyboard('{Enter}')
}

describe('ChatPanel states', () => {
  it('starts empty and ready, with a 16 px field', async () => {
    await setup()
    await expect.poll(state).toBe('ready')
    expect(document.querySelector('[data-empty]')).not.toBeNull()
    // No run, no scene: nothing is drawn ahead of an event (MEM-17).
    expect(document.querySelector('[data-scene]')).toBeNull()
    expect(document.querySelector('[data-status]')?.textContent?.trim()).toBe('Prêt')
    const prompt = document.querySelector('[data-composer] textarea') as HTMLElement
    expect(getComputedStyle(prompt).fontSize).toBe('16px')
    // Touch targets of 44 px, measured on a coarse pointer on 2026-11-14.
    const submit = document.querySelector('[data-submit]') as HTMLElement
    for (const target of [prompt, submit]) {
      const box = target.getBoundingClientRect()
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
    }
  })

  it('goes submitted, streaming, then ready, and shows the answer', async () => {
    const { stream, requests, respond } = await setup()
    await send('relire les portes')

    await expect.poll(state).toBe('submitted')
    expect(requests[0]).toMatchObject({
      messages: [{ role: 'user', parts: [{ type: 'text', text: 'relire les portes' }] }],
      trigger: 'submit-message',
    })

    respond()
    stream.send({ type: 'start', messageId: 'a1', messageMetadata: { threadId: 'chat-1' } })
    stream.send({
      type: 'data-run-event',
      data: { kind: 'run-started', at: 0, node: null, data: {} },
    })
    stream.send({
      type: 'data-run-event',
      data: { kind: 'node-started', at: 0.1, node: 'supervisor', data: { taskId: 't1' } },
    })
    // The scene draws the run while it streams, from its events.
    await expect
      .poll(() =>
        document.querySelector('[data-node="supervisor"]')?.getAttribute('data-node-state'),
      )
      .toBe('running')
    stream.send({ type: 'text-start', id: 't1' })
    stream.send({ type: 'text-delta', id: 't1', delta: 'fait : relire' })
    await expect.poll(state).toBe('streaming')
    await expect.poll(() => root().textContent).toContain('fait : relire')

    stream.send({ type: 'text-delta', id: 't1', delta: ' les portes' })
    stream.send({ type: 'text-end', id: 't1' })
    stream.send({ type: 'finish', finishReason: 'stop' })
    stream.send('[DONE]')
    stream.close()

    await expect.poll(state).toBe('ready')
    expect(root().textContent).toContain('fait : relire les portes')
    // The run event is data for the scene, never printed in the conversation.
    expect(root().textContent).not.toContain('run-started')
  })

  it('shows a model error as a readable alert', async () => {
    const { stream, respond } = await setup()
    await send('une tâche')
    respond()
    stream.send({ type: 'start', messageId: 'a1' })
    stream.send({
      type: 'error',
      errorText: 'Le modèle est saturé pour le moment (429). Réessayez dans une minute.',
    })
    stream.send({ type: 'finish', finishReason: 'error' })
    stream.send('[DONE]')
    stream.close()

    await expect.poll(state).toBe('error')
    const alert = document.querySelector('[data-chat-error]')
    expect(alert?.getAttribute('role')).toBe('alert')
    expect(alert?.textContent).toContain('Le modèle est saturé')
    expect(document.querySelector('[data-submit]')?.getAttribute('aria-label')).toBe('Relancer')
  })

  it('stops a run on demand', async () => {
    const { stream, respond } = await setup()
    await send('attendre')
    respond()
    stream.send({ type: 'start', messageId: 'a1' })
    stream.send({ type: 'text-start', id: 't1' })
    stream.send({ type: 'text-delta', id: 't1', delta: 'début' })
    await expect.poll(state).toBe('streaming')

    const submit = document.querySelector('[data-submit]') as HTMLElement
    expect(submit.getAttribute('aria-label')).toBe('Arrêter')
    await userEvent.click(submit)

    await expect.poll(state).toBe('stopped')
    expect(document.querySelector('[data-status]')?.textContent?.trim()).toBe(
      'Arrêté à votre demande',
    )
  })
})

describe('ChatPanel when the service itself fails', () => {
  async function mountWith(fetchImpl: typeof fetch) {
    return await render(ChatPanel, {
      props: { transport: chatTransport(fetchImpl) },
      global: { plugins: [createAppRouter(), ui] },
    })
  }

  it('says in French that the service is unreachable', async () => {
    await mountWith(async () => {
      throw new TypeError('Failed to fetch')
    })
    await send('une tâche')
    await expect.poll(state).toBe('error')
    expect(document.querySelector('[data-chat-error]')?.textContent?.trim()).toBe(
      SERVICE_UNREACHABLE,
    )
  })

  it('says in French that the service answered an HTTP error', async () => {
    await mountWith(async () => new Response('Bad Gateway', { status: 502 }))
    await send('une tâche')
    await expect.poll(state).toBe('error')
    expect(document.querySelector('[data-chat-error]')?.textContent).toContain('erreur 502')
  })
})

describe('the recorded demo (MEM-24)', () => {
  it('prefills the recorded brief and says it is a recording', async () => {
    const demo = 'Prépare une annonce de sortie pour la v2'
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url === '/health') return Response.json({ ready: false, demo: true, demoBrief: demo })
      return new Response('not found', { status: 404 })
    })

    await render(ChatPanel, {
      props: { transport: new DefaultChatTransport({ api: '/api/chat' }) },
      global: { plugins: [createAppRouter(), ui] },
    })

    const note = () => document.querySelector('[data-demo]') as HTMLElement | null
    await expect.poll(note).not.toBeNull()
    expect(note()!.textContent).toContain('Démonstration enregistrée')
    const prompt = document.querySelector('[data-composer] textarea') as HTMLTextAreaElement
    expect(prompt.value).toBe(demo)
    spy.mockRestore()
  })

  it('leaves the composer empty when the service has a model', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input) === '/health'
        ? Response.json({ ready: true, demo: false, demoBrief: null })
        : new Response('not found', { status: 404 }),
    )

    await render(ChatPanel, {
      props: { transport: new DefaultChatTransport({ api: '/api/chat' }) },
      global: { plugins: [createAppRouter(), ui] },
    })
    await new Promise((r) => setTimeout(r, 100))

    expect(document.querySelector('[data-demo]')).toBeNull()
    const prompt = document.querySelector('[data-composer] textarea') as HTMLTextAreaElement
    expect(prompt.value).toBe('')
  })
})
