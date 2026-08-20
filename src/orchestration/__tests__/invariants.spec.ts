// Story 1.8 — la preuve que rien n'est simulé.
// Ces tests ne vérifient pas une fonctionnalité : ils vérifient que ce qui
// est affiché correspond à ce qui vit. C'est la contre-métrique C3 du PRD.
import { describe, expect, it } from 'vitest'
import { creerNoyau } from '../../runtime/noyau'
import { creerStore } from '../../etat/store'
import { lancer } from '../lancer'
import { claimCheck } from '../../scenarios/claim-check'
import { registreEu } from '../../outils/registre-eu'
import type { IdComposant } from '../../runtime/contrat'

const tick = async () => {
  for (let index = 0; index < 6; index += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

async function runLance() {
  const noyau = creerNoyau()
  const store = creerStore()
  store.brancher(noyau)
  const lancement = await lancer(noyau, claimCheck)
  await tick()
  return { noyau, store, lancement }
}

/** Les nœuds que le graphe montrerait comme vivants. */
const affichesVivants = (noeuds: readonly { id: string; etat: string }[]) =>
  noeuds
    .filter((n) => n.etat !== 'libere')
    .map((n) => n.id)
    .sort()

describe("l'invariant C3 : le graphe est la topologie réelle", () => {
  it('affiche exactement les composants vivants du runtime, identifiant par identifiant', async () => {
    const { noyau, store } = await runLance()

    const vivantsMoteur = noyau
      .introspecter()
      .composants.map((c) => c.id as string)
      .sort()
    expect(affichesVivants(store.etat.value.noeuds)).toEqual(vivantsMoteur)
  })

  it('reste vrai après avoir tué un outil à chaud', async () => {
    const { noyau, store } = await runLance()
    const registre = noyau.introspecter().composants.find((c) => c.nom === 'outil-registre')
    expect(registre).toBeDefined()

    await noyau.liberer(registre!.id)
    await tick()

    const vivantsMoteur = noyau
      .introspecter()
      .composants.map((c) => c.id as string)
      .sort()
    expect(affichesVivants(store.etat.value.noeuds)).toEqual(vivantsMoteur)
  })

  it('reste vrai après la libération complète du run', async () => {
    const { noyau, store, lancement } = await runLance()
    await noyau.liberer(lancement.maitre)
    await tick()

    expect(noyau.introspecter().composants).toHaveLength(0)
    expect(affichesVivants(store.etat.value.noeuds)).toEqual([])
    // Les nœuds restent visibles, marqués libérés : la rétractation se montre.
    expect(store.etat.value.noeuds).toHaveLength(claimCheck.casting.length + 1)
    expect(store.etat.value.noeuds.every((n) => n.etat === 'libere')).toBe(true)
  })
})

describe('la réversibilité, observable', () => {
  it("désactive seuls les dépendants quand l'outil part, et les réactive quand il revient", async () => {
    const { noyau, store } = await runLance()
    const constructeurs = () =>
      store.etat.value.noeuds.filter((n) => n.nom.startsWith('constructeur-'))
    expect(constructeurs().every((n) => n.etat === 'termine')).toBe(true)

    const registre = noyau.introspecter().composants.find((c) => c.nom === 'outil-registre')
    await noyau.liberer(registre!.id as IdComposant)
    await tick()

    // Personne n'a rien demandé : ils se désactivent d'eux-mêmes.
    expect(constructeurs().every((n) => n.etat === 'en-attente-de-dependance')).toBe(true)
    for (const noeud of constructeurs()) {
      expect(noeud.cause).toEqual({ genre: 'dependance-partie', noms: ['registre'] })
    }

    await noyau.charger(registreEu([]))
    await tick()

    expect(constructeurs().every((n) => n.etat === 'termine')).toBe(true)
  })

  it('ne laisse aucun effet résiduel après une libération complète', async () => {
    const { noyau } = await runLance()
    await noyau.libererTout()
    await tick()
    expect(noyau.introspecter().composants).toHaveLength(0)
    expect(noyau.introspecter().dependances).toHaveLength(0)

    // Le run peut repartir : aucun nom n'est resté réservé.
    const relance = await lancer(noyau, claimCheck)
    await tick()
    expect(relance.maitre).toBeDefined()
    expect(noyau.introspecter().composants).toHaveLength(claimCheck.casting.length + 1)
  })

  it("n'émet aucun événement d'incident sur un run nominal", async () => {
    const { store } = await runLance()
    expect(store.etat.value.incidents).toEqual([])
  })
})
