// Mes données (RGPD) : exporter, et effacer son compte avec confirmation.
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import FactoryApp from '../FactoryApp.vue'
import '../../assets/tokens.css'
import '../../assets/app.css'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

function stubService() {
  let authed = true
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.includes('/auth/session')) {
      return authed
        ? json({ authenticated: true, email: 'moi@equipe.co', org: 'o1' })
        : json({ authenticated: false })
    }
    if (url.includes('/api/runs')) return json({ runs: [] })
    if (method === 'DELETE' && url.endsWith('/api/account')) {
      authed = false
      return json({ erased: true })
    }
    throw new Error(`unexpected ${method} ${url}`)
  }) as typeof fetch
}

function byText(selector: string, text: string): Element | undefined {
  return [...document.querySelectorAll(selector)].find((el) => el.textContent?.trim() === text)
}

describe('my data', () => {
  it('offers export and erases the account after confirmation', async () => {
    stubService()
    render(FactoryApp)
    await wait(120)
    ;(byText('.account .status-toggle', 'mes runs') as HTMLButtonElement).click()
    await wait(120)

    // Export link points at the export endpoint.
    const exportLink = byText('.my-data a', 'exporter mes données') as HTMLAnchorElement
    expect(exportLink).toBeDefined()
    expect(exportLink.getAttribute('href')).toBe('/api/account/export')

    // Delete asks for confirmation before doing anything.
    ;(byText('.my-data .status-toggle', 'supprimer mon compte') as HTMLButtonElement).click()
    await wait(30)
    expect(document.querySelector('.my-data-warn')).not.toBeNull()

    // Confirm: the account is erased and the view returns to signed-out.
    ;(byText('.my-data .status-toggle', 'confirmer') as HTMLButtonElement).click()
    await wait(120)
    expect(byText('.account-signin', 'se connecter')).toBeDefined()
    expect(document.querySelector('#my-runs')).toBeNull()
  })
})
