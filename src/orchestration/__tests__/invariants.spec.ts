// Story 1.8 — la preuve que rien n'est simulé.
// Ces tests ne vérifient pas une fonctionnalité : ils vérifient que ce qui
// est affiché correspond à ce qui vit. C'est la contre-métrique C3 du PRD.
import { describe, expect, it } from 'vitest'
import { creerNoyau } from '../../runtime/noyau'
import { creerStore } from '../../etat/store'
import { lancerUsine } from '../usine'
import type { Composant, IdComposant } from '../../runtime/contrat'
import { BRIEF_SANTE, jusqua } from './aide'

/** Franchit la porte humaine : sans ça le run reste arrêté, par construction. */
async function approuver(noyau: ReturnType<typeof creerNoyau>) {
  for (const id of noyau.portesEnAttente()) noyau.decider(id, 'approuve')
}

const tick = async () => {
  for (let index = 0; index < 6; index += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

/** Le nom de la source de vérité vient du plan, il n'est plus écrit ici. */
const nomDeLaSource = (store: ReturnType<typeof creerStore>) =>
  store.etat.value.noeuds.find((n) => n.fournit.includes('registre'))?.nom ?? ''

/** Une source de vérité de remplacement, pour prouver la réactivation. */
const sourceDeRemplacement = (nom: string): Composant => ({
  nom,
  fournit: ['registre'],
  presentation: { libelle: 'Source', role: 'Source de vérité rechargée' },
  applique(contexte) {
    contexte.fournir('registre', { regles: [] })
    contexte.terminer()
  },
})

async function runLance() {
  const noyau = creerNoyau()
  const store = creerStore()
  store.brancher(noyau)
  const lancement = await lancerUsine(noyau, { brief: BRIEF_SANTE })
  await jusqua(() => noyau.portesEnAttente().length > 0)
  await approuver(noyau)
  await jusqua(() => noyau.produit('livrable') !== undefined)
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
    const registre = noyau.introspecter().composants.find((c) => c.nom === nomDeLaSource(store))
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
    expect(store.etat.value.noeuds.length).toBeGreaterThan(4)
    expect(store.etat.value.noeuds.every((n) => n.etat === 'libere')).toBe(true)
  })
})

describe('la réversibilité, observable', () => {
  it("désactive seuls les dépendants quand l'outil part, et les réactive quand il revient", async () => {
    const { noyau, store } = await runLance()
    // Ceux qui dépendent réellement du registre, quel que soit le plan.
    // Les pièces fabriquées sont hors de ce test : leur retour dépend de la
    // refabrication par leur parent, qui est un autre sujet (voir
    // deferred-work.md — « la pièce fabriquée ne revient pas après un
    // échange de source à chaud »).
    const dependants = () =>
      store.etat.value.noeuds.filter(
        (n) =>
          n.injecte.includes('registre') &&
          !n.fournit.includes('registre') &&
          n.fabrication === undefined,
      )
    expect(dependants().length).toBeGreaterThan(0)
    expect(dependants().every((n) => n.etat === 'termine')).toBe(true)

    const nom = nomDeLaSource(store)
    const registre = noyau.introspecter().composants.find((c) => c.nom === nom)
    await noyau.liberer(registre!.id as IdComposant)
    await tick()

    // Personne n'a rien demandé : ils se désactivent d'eux-mêmes.
    expect(dependants().every((n) => n.etat === 'en-attente-de-dependance')).toBe(true)
    for (const noeud of dependants()) {
      expect(noeud.cause).toEqual({ genre: 'dependance-partie', noms: ['registre'] })
    }

    await noyau.charger(sourceDeRemplacement(`${nom}-bis`))
    // La réactivation refait le travail : elle prend le temps qu'elle prend.
    await jusqua(() => dependants().every((n) => n.etat === 'termine'))

    expect(
      dependants()
        .map((n) => `${n.nom}:${n.etat}`)
        .join(' '),
    ).not.toContain('en-attente')
  })

  it('ne laisse aucun effet résiduel après une libération complète', async () => {
    const { noyau } = await runLance()
    await noyau.libererTout()
    await tick()
    expect(noyau.introspecter().composants).toHaveLength(0)
    expect(noyau.introspecter().dependances).toHaveLength(0)

    // Le run peut repartir : aucun nom n'est resté réservé.
    const relance = await lancerUsine(noyau, { brief: BRIEF_SANTE })
    await jusqua(() => noyau.portesEnAttente().length > 0)
    await approuver(noyau)
    await jusqua(() => noyau.produit('livrable') !== undefined)
    expect(relance.maitre).toBeDefined()
    expect(noyau.introspecter().composants.length).toBeGreaterThan(4)
  })

  it("n'émet aucun événement d'incident sur un run nominal", async () => {
    const { store } = await runLance()
    expect(store.etat.value.incidents).toEqual([])
  })
})
