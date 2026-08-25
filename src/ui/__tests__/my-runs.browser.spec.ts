// La vue « mes runs » : un visiteur connecté voit ses runs et peut les mettre à
// la corbeille. Vérifié dans un vrai navigateur, avec un service simulé.
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

// A tiny stateful service: one live run that can be trashed.
function stubService() {
  const live = [{ id: 'r1', brief: 'mon run', events: 3, shared: false }]
  const trash: typeof live = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.includes('/auth/session')) {
      return json({ authenticated: true, email: 'moi@equipe.co', org: 'o1' })
    }
    if (url.endsWith('/api/runs?trashed=1')) return json({ runs: trash })
    if (url.endsWith('/api/runs')) return json({ runs: live })
    if (method === 'DELETE' && url.includes('/api/runs/r1')) {
      const moved = live.splice(0, live.length)
      trash.push(...moved)
      return json({ trashed: true })
    }
    throw new Error(`unexpected ${method} ${url}`)
  }) as typeof fetch
}

function byText(selector: string, text: string): Element | undefined {
  return [...document.querySelectorAll(selector)].find((el) => el.textContent?.trim() === text)
}

describe('my runs', () => {
  it('lists the visitor runs and trashes one', async () => {
    stubService()
    render(FactoryApp)
    await wait(120)

    // Open the panel from the brand line.
    ;(byText('.account .status-toggle', 'mes runs') as HTMLButtonElement).click()
    await wait(120)

    expect(document.querySelector('#my-runs')).not.toBeNull()
    expect(byText('.my-runs-open', 'mon run')).toBeDefined()

    // Trash it: the row disappears from the live list.
    ;(byText('.my-runs-row .status-toggle', 'corbeille') as HTMLButtonElement).click()
    await wait(120)
    expect(byText('.my-runs-open', 'mon run')).toBeUndefined()
    expect(document.querySelector('.my-runs-empty')).not.toBeNull()
  })
})
