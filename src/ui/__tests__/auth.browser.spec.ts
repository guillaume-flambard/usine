// La connexion vit dans la ligne de marque : anonyme on la propose, connecté on
// montre l'email. Conserver/partager, signé-out, invite à se connecter. Ces
// promesses se vérifient dans un vrai navigateur.
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { startRun, wait } from './harness'
import FactoryApp from '../FactoryApp.vue'
import '../../assets/main.css'
import '../../assets/tokens.css'
import '../../assets/app.css'


const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

function byText(selector: string, text: string): Element | undefined {
  return [...document.querySelectorAll(selector)].find((el) => el.textContent?.trim() === text)
}

describe('sign-in in the brand line', () => {
  it('offers sign-in when signed out, and reveals an email field', async () => {
    render(FactoryApp)
    await wait(80)
    const signin = byText('.account-signin', 'se connecter')
    expect(signin).toBeDefined()
    expect(document.querySelector('.account-email')).toBeNull()

    ;(signin as HTMLButtonElement).click()
    await wait(30)
    expect(document.querySelector('#signin-email')).not.toBeNull()
  })

  it('shows the email and no sign-in link once a session resolves', async () => {
    // Stub only the session probe; let everything else fail gracefully.
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/auth/session')) {
        return new Response(JSON.stringify({ authenticated: true, email: 'moi@equipe.co', org: 'o1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error('offline')
    }) as typeof fetch

    render(FactoryApp)
    await wait(120)
    expect(document.querySelector('.account-email')?.textContent?.trim()).toBe('moi@equipe.co')
    expect(byText('.account-signin', 'se connecter')).toBeUndefined()
  })
})

describe('gating persistence on sign-in', () => {
  it('prompts sign-in when a signed-out visitor tries to share a run', async () => {
    render(FactoryApp)
    await wait(80)
    // Start the demo the way a keyless visitor does: the recorded-run entry
    // writes the known brief and launches.
    await startRun()

    // The demo ran signed-out: the share action is present.
    const share = byText('.live-actions .picker', 'Lien de rejeu')
    expect(share).toBeDefined()
    ;(share as HTMLButtonElement).click()
    await wait(60)

    // Rather than a 401, the page opens the sign-in panel and says why.
    expect(document.querySelector('#signin-panel')).not.toBeNull()
    expect(document.querySelector('.thread-incident')?.textContent).toMatch(/[Cc]onnectez-vous/)
  })
})
