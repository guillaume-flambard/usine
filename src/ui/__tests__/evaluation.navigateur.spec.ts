// L'arbitrage renversé, vérifié dans un vrai navigateur : les agents écrivent
// du code et ce code doit tourner. Sous l'ancienne politique stricte, ce test
// échouerait — c'est exactement ce qu'il est là pour rendre visible.
import { describe, expect, it } from 'vitest'
import { creerNoyau } from '../../runtime/noyau'
import { lancerUsine, produitDuRun } from '../../orchestration/usine'
import { raisonneurDeDemonstration, BRIEF_DE_DEMONSTRATION } from '../../exemples/demonstration'

const attendre = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

describe("l'évaluation de code dans le navigateur", () => {
  it('évalue une fonction écrite pendant le run et la fait tourner', async () => {
    const noyau = creerNoyau()
    await lancerUsine(noyau, {
      brief: BRIEF_DE_DEMONSTRATION,
      raisonneur: raisonneurDeDemonstration(20),
      pasMs: 20,
      delaiStabilisationMs: 6000,
    })
    const fin = Date.now() + 12_000
    while (Date.now() < fin && noyau.portesEnAttente().length === 0) await attendre(20)

    const produit = produitDuRun(noyau)
    expect(produit, "aucun outil n'a été écrit").toBeDefined()

    const sortie = produit?.executer(
      'Ce complément guérit les carences. Il contribue à réduire la fatigue.',
    ) as { verdict: string; source: string }[]
    expect(sortie).toHaveLength(2)
    expect(sortie[0]?.verdict).toBe('interdit')
    expect(sortie[0]?.source).toContain('1924/2006')
    expect(sortie[1]?.verdict).toBe('autorisé')

    await noyau.libererTout()
  }, 20_000)

  it("n'ouvre le réseau vers personne pendant un run", async () => {
    // La politique autorise l'évaluation ; elle n'autorise pas pour autant le
    // code produit à sortir de la page.
    const appels: string[] = []
    const vrai = globalThis.fetch
    globalThis.fetch = ((entree: RequestInfo | URL, options?: RequestInit) => {
      appels.push(String(entree))
      return vrai(entree, options)
    }) as typeof fetch

    try {
      const noyau = creerNoyau()
      await lancerUsine(noyau, {
        brief: BRIEF_DE_DEMONSTRATION,
        raisonneur: raisonneurDeDemonstration(10),
        pasMs: 20,
        delaiStabilisationMs: 4000,
      })
      const fin = Date.now() + 10_000
      while (Date.now() < fin && noyau.portesEnAttente().length === 0) await attendre(20)
      expect(appels).toEqual([])
      await noyau.libererTout()
    } finally {
      globalThis.fetch = vrai
    }
  }, 20_000)
})
