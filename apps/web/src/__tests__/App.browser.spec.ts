import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
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

afterEach(async () => {
  vi.unstubAllGlobals()
  await page.viewport(1440, 900)
})

const mount = () => render(App, { global: { plugins: [createAppRouter(), ui] } })
const door = () => document.querySelector('[data-shell]')?.getAttribute('data-door')

describe('App shell', () => {
  it('renders the atelier: bar, sidebar, canvas with conversation and composer', async () => {
    serve({ authenticated: true })
    const screen = await mount()

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Atelier Usine' }))
      .toBeInTheDocument()
    await expect.element(screen.getByRole('status')).toHaveTextContent('Prêt')
    await expect.element(screen.getByRole('region', { name: 'Conversation' })).toBeVisible()
    expect(document.querySelector('[data-bar]')).not.toBeNull()
    expect(document.querySelector('[data-sidebar]')).not.toBeNull()
    expect(document.querySelector('[data-canvas]')).not.toBeNull()
    expect(document.querySelector('[data-composer] textarea')).not.toBeNull()
    // The scene and the inspector come with the first run event
    // (ChatPanel.browser.spec.ts): nothing is drawn ahead of one.
    expect(document.querySelector('[data-scene]')).toBeNull()
    expect(document.querySelector('[data-inspector]')).toBeNull()
    expect(document.querySelector('[data-landing]')).toBeNull()
  })

  it('shows initials from the session e-mail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/auth/session'
          ? Response.json({ authenticated: true, email: 'guillaume.flambard@example.org' })
          : Response.json({ items: [], next_cursor: null }),
      ),
    )
    await mount()
    await expect.poll(() => document.querySelector('[data-avatar]')?.textContent).toBe('GF')
  })

  it('opens on an atelier left open in development, without a session', async () => {
    serve({ authenticated: false }, 200)
    await mount()
    await expect.poll(door).toBe('in')
    expect(document.querySelector('[data-composer]')).not.toBeNull()
  })

  it('shows the public page to a signed-out visitor, and nothing that would answer 401', async () => {
    serve({ authenticated: false }, 401)
    const screen = await mount()

    await expect.poll(door).toBe('out')
    expect(document.querySelector('[data-landing]')).not.toBeNull()
    await expect
      .element(screen.getByRole('heading', { level: 1 }))
      .toHaveTextContent('Mes agents enquêtent. Je décide.')
    const button = screen.getByRole('link', { name: 'Se connecter pour lancer un run' })
    await expect.element(button).toHaveAttribute('href', '/auth/oidc/login')
    expect(document.querySelector('[data-nav-sign-in]')?.getAttribute('href')).toBe(
      '/auth/oidc/login',
    )
    expect(document.querySelector('[data-composer]')).toBeNull()
    expect(document.querySelector('[data-sidebar]')).toBeNull()
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

  it.each([
    ['the public page', { authenticated: false }, 401, '[data-landing]'],
    ['the atelier', { authenticated: true }, 200, '[data-composer]'],
  ] as const)('does not scroll sideways at 390 px: %s', async (_name, session, status, marker) => {
    await page.viewport(390, 844)
    serve(session, status)
    await mount()
    await expect.poll(() => document.querySelector(marker)).not.toBeNull()
    const root = document.documentElement
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1)
    for (const element of document.querySelectorAll<HTMLElement>('[data-shell] *')) {
      const box = element.getBoundingClientRect()
      if (box.width === 0) continue
      expect(box.right, element.className).toBeLessThanOrEqual(root.clientWidth + 1)
    }
  })
})
