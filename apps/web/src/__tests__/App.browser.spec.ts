import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import ui from '@nuxt/ui/vue-plugin'
import App from '../App.vue'
import { createAppRouter } from '../router'
import '../assets/main.css'

/** The two calls the door makes: the session, then one authenticated route. */
function serve(session: { authenticated: boolean } | 'down', probeStatus = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (session === 'down') throw new TypeError('Failed to fetch')
      if (url === '/auth/session') return Response.json(session)
      if (url === '/api/specialists') return Response.json({ items: [] }, { status: probeStatus })
      return Response.json({}, { status: 404 })
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

const mount = () => render(App, { global: { plugins: [createAppRouter(), ui] } })
const door = () => document.querySelector('[data-shell]')?.getAttribute('data-door')

describe('App shell', () => {
  it('renders the brand, the status line, the conversation and the composer', async () => {
    serve({ authenticated: true })
    const screen = await mount()

    await expect
      .element(screen.getByRole('heading', { level: 1, name: "L'usine agentique" }))
      .toBeVisible()
    await expect.element(screen.getByRole('status')).toHaveTextContent('Prêt')
    await expect.element(screen.getByRole('region', { name: 'Conversation' })).toBeVisible()
    expect(document.querySelector('[data-composer] textarea')).not.toBeNull()
    // Four zones and not one more (CLAUDE.md). The scene is the fourth, and
    // it appears with the first run event (ChatPanel.browser.spec.ts).
    expect(document.querySelector('[data-scene]')).toBeNull()
  })

  it('opens on an atelier left open in development, without a session', async () => {
    serve({ authenticated: false }, 200)
    await mount()
    await expect.poll(door).toBe('in')
    expect(document.querySelector('[data-composer]')).not.toBeNull()
  })

  it('shows the door of a closed atelier, and nothing that would answer 401', async () => {
    serve({ authenticated: false }, 401)
    const screen = await mount()

    await expect.poll(door).toBe('out')
    const button = screen.getByRole('link', { name: 'Se connecter' })
    await expect.element(button).toHaveAttribute('href', '/auth/oidc/login')
    expect(document.querySelector('[data-composer]')).toBeNull()
    const box = (
      document.querySelector('[data-sign-in-button]') as HTMLElement
    ).getBoundingClientRect()
    expect(box.height).toBeGreaterThanOrEqual(44)
  })

  it('says so when the service does not answer, and lets you retry', async () => {
    serve('down')
    const screen = await mount()

    await expect.poll(door).toBe('unreachable')
    expect(document.querySelector('[data-sign-in-error]')?.textContent).toContain('ne répond pas')
    expect(document.querySelector('[data-sign-in-error]')?.getAttribute('role')).toBe('alert')
    serve({ authenticated: true })
    await screen.getByRole('button', { name: 'Réessayer' }).click()
    await expect.poll(door).toBe('in')
  })
})
