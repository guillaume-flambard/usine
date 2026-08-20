import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  installerTelemetrie,
  nouveauRun,
  payoffAffiche,
  porteAtteinte,
  runLance,
  transportSansCookie,
  verificationSoumise,
  type Evenement,
} from '../index'

const journal: Evenement[] = []

afterEach(() => {
  installerTelemetrie(undefined)
  journal.length = 0
})

const brancher = () => {
  installerTelemetrie({ compter: (e) => journal.push(e) })
}

describe('télémétrie', () => {
  it('ne mesure rien tant qu aucun transport n est installé', () => {
    nouveauRun()
    runLance()
    porteAtteinte()
    expect(journal).toEqual([])
  })

  it('compte exactement les quatre faits', () => {
    brancher()
    runLance()
    porteAtteinte()
    payoffAffiche()
    verificationSoumise()
    expect(journal).toEqual([
      'run-lance',
      'porte-atteinte',
      'payoff-affiche',
      'verification-soumise',
    ])
  })

  it('ne compte pas deux fois le même fait dans un run', () => {
    brancher()
    runLance()
    verificationSoumise()
    verificationSoumise()
    verificationSoumise()
    expect(journal.filter((e) => e === 'verification-soumise')).toHaveLength(1)
  })

  it("n'invente pas d'adresse quand le point d'entrée porte déjà une requête", async () => {
    const appels: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        appels.push(String(url))
        return new Response('')
      }),
    )
    installerTelemetrie(transportSansCookie('/mesure?src=lab'))
    runLance()
    await new Promise<void>((r) => setTimeout(r, 0))

    const adresse = new URL(appels[0] ?? '')
    expect(adresse.searchParams.get('src')).toBe('lab')
    expect(adresse.searchParams.get('e')).toBe('run-lance')
    vi.unstubAllGlobals()
  })

  it('recompte au run suivant', () => {
    brancher()
    runLance()
    porteAtteinte()
    runLance()
    porteAtteinte()
    expect(journal.filter((e) => e === 'porte-atteinte')).toHaveLength(2)
  })

  it('envoie sans cookie, sans corps, et ne lève jamais', async () => {
    const appels: [string, RequestInit | undefined][] = []
    const faux = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      appels.push([String(url), init])
      throw new Error('réseau coupé')
    })
    vi.stubGlobal('fetch', faux)

    installerTelemetrie(transportSansCookie('/mesure'))
    expect(() => runLance()).not.toThrow()
    await new Promise<void>((r) => setTimeout(r, 0))

    expect(appels).toHaveLength(1)
    const [url, init] = appels[0] ?? ['', undefined]
    expect(new URL(url).pathname).toBe('/mesure')
    expect(new URL(url).searchParams.get('e')).toBe('run-lance')
    // Aucun contenu utilisateur ne peut voyager : il n'y a pas de corps.
    expect(init?.body).toBeUndefined()
    expect(init?.credentials).toBe('omit')
    vi.unstubAllGlobals()
  })

  it("n'expose que quatre fonctions de comptage", async () => {
    const module = await import('../index')
    const compteurs = Object.keys(module).filter(
      (cle) => !['installerTelemetrie', 'nouveauRun', 'transportSansCookie'].includes(cle),
    )
    expect(compteurs.sort()).toEqual([
      'payoffAffiche',
      'porteAtteinte',
      'runLance',
      'verificationSoumise',
    ])
  })
})
