// La vue « mes runs » : un visiteur connecté voit ses runs et peut les mettre à
// la corbeille. Vérifié dans un vrai navigateur, avec un service simulé.
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import FactoryApp from '../FactoryApp.vue'
import '../../assets/main.css'
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
    ;(document.querySelector('[data-runs-toggle]') as HTMLButtonElement).click()
    await wait(120)

    expect(document.querySelector('#my-runs')).not.toBeNull()
    expect(byText('.my-runs-open', 'mon run')).toBeDefined()

    // Trash it: the row disappears from the live list.
    ;(document.querySelector('[data-run-trash]') as HTMLButtonElement).click()
    await wait(120)
    expect(byText('.my-runs-open', 'mon run')).toBeUndefined()
    expect(document.querySelector('.my-runs-empty')).not.toBeNull()
  })

  // Les deux onglets étaient un `role="tablist"` sans panneau, sans
  // `aria-controls` et sans tabindex tournant : au clavier, on ne pouvait pas
  // passer de l'un à l'autre.
  it('moves between the two tabs from the keyboard', async () => {
    stubService()
    render(FactoryApp)
    await wait(120)
    ;(document.querySelector('[data-runs-toggle]') as HTMLButtonElement).click()
    await wait(150)

    const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')]
    expect(tabs).toHaveLength(2)

    // La liste d'onglets ne prend qu'un arrêt dans l'ordre de tabulation : on
    // entre une fois, on circule ensuite aux flèches.
    expect(tabs.filter((tab) => tab.tabIndex >= 0).length).toBeLessThanOrEqual(1)

    const panelOf = (tab: HTMLElement) => {
      const id = tab.getAttribute('aria-controls')
      expect(id, "l'onglet doit nommer le panneau qu'il commande").not.toBeNull()
      return document.getElementById(id!)
    }
    expect(panelOf(tabs[0]!)).not.toBeNull()

    tabs[0]!.focus()
    tabs[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await wait(150)

    expect(document.activeElement).toBe(tabs[1])
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('false')
    // Et le panneau montré est bien celui de l'onglet choisi.
    expect(panelOf(tabs[1]!)?.textContent).toContain('Corbeille')
  })
})
