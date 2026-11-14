/**
 * The chat states (MEM-15), in a real browser, with the real DefaultChatTransport
 * of ai@7.0.165. Only `fetch` is replaced: the test writes the UI message stream
 * chunk by chunk, in the shape `POST /api/chat` sends (MEM-14).
 */
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import ui from '@nuxt/ui/vue-plugin'
import { DefaultChatTransport } from 'ai'
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

function setup() {
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
  const screen = render(ChatPanel, {
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
    setup()
    await expect.poll(state).toBe('ready')
    expect(document.querySelector('[data-empty]')).not.toBeNull()
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
    const { stream, requests, respond } = setup()
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
    const { stream, respond } = setup()
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
    const { stream, respond } = setup()
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
