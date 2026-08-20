import { describe, expect, it } from 'vitest'
import { creerNoyau } from '../noyau'
import type { Composant, IdComposant } from '../contrat'
import type { EvenementRun } from '../evenements'

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function journal() {
  const noyau = creerNoyau()
  const evenements: EvenementRun[] = []
  noyau.abonner((e) => evenements.push(e))
  const types = () => evenements.map((e) => e.type)
  return { noyau, evenements, types }
}

function outil(nom: string, fournit: string, valeur: unknown = { ok: true }): Composant {
  return {
    nom,
    fournit: [fournit],
    presentation: { role: `Fournit ${fournit}` },
    applique(contexte) {
      contexte.fournir(fournit, valeur)
    },
  }
}

function agent(nom: string, injecte: string[], surApplique?: () => void): Composant {
  return {
    nom,
    injecte,
    presentation: { role: `Consomme ${injecte.join(', ')}` },
    applique() {
      surApplique?.()
    },
  }
}

describe('noyau de composition', () => {
  it('charge un composant sans dépendance et émet création puis activation', async () => {
    const { noyau, types } = journal()
    const id = await noyau.charger({
      nom: 'solo',
      presentation: { role: 'Ne dépend de rien' },
      applique(contexte) {
        contexte.effet(() => () => {}, 'ressource')
      },
    })
    await tick()

    expect(id).toBeDefined()
    expect(types()).toEqual(['composant-cree', 'composant-active'])
    expect(noyau.introspecter().composants[0]?.etat).toBe('actif')
  })

  it('laisse inactif un composant dont la dépendance manque', async () => {
    const { noyau, types } = journal()
    let activations = 0
    await noyau.charger(agent('verificateur', ['registre'], () => (activations += 1)))
    await tick()

    expect(activations).toBe(0)
    expect(types()).toEqual(['composant-cree'])
    expect(noyau.introspecter().composants[0]?.etat).toBe('en-attente')
  })

  it('active seul le dépendant quand la dépendance arrive', async () => {
    const { noyau } = journal()
    let activations = 0
    await noyau.charger(agent('verificateur', ['registre'], () => (activations += 1)))
    await tick()
    await noyau.charger(outil('registre-eu', 'registre'))
    await tick()

    expect(activations).toBe(1)
    const topologie = noyau.introspecter()
    expect(topologie.dependances).toHaveLength(1)
    expect(topologie.dependances[0]?.nom).toBe('registre')
  })

  it('désactive seul le dépendant quand la dépendance part', async () => {
    const { noyau, evenements } = journal()
    await noyau.charger(agent('verificateur', ['registre']))
    const idOutil = await noyau.charger(outil('registre-eu', 'registre'))
    await tick()
    await noyau.liberer(idOutil as IdComposant)
    await tick()

    expect(evenements.some((e) => e.type === 'composant-desactive')).toBe(true)
    const verificateur = noyau.introspecter().composants.find((c) => c.nom === 'verificateur')
    expect(verificateur?.etat).toBe('en-attente')
  })

  it('libère en cascade ce qu un composant a chargé, effets en ordre inverse', async () => {
    const { noyau } = journal()
    const trace: string[] = []
    const idMaitre = await noyau.charger({
      nom: 'maitre',
      presentation: { role: 'Charge un enfant' },
      applique(contexte) {
        contexte.effet(() => {
          trace.push('maitre:ouvre')
          return () => trace.push('maitre:ferme')
        }, 'ressource-maitre')
        void contexte.charger({
          nom: 'enfant',
          presentation: { role: 'Chargé par le maître' },
          applique(interne) {
            interne.effet(() => {
              trace.push('enfant:ouvre')
              return () => trace.push('enfant:ferme')
            }, 'ressource-enfant')
          },
        })
      },
    })
    await tick()
    expect(trace).toEqual(['maitre:ouvre', 'enfant:ouvre'])

    await noyau.liberer(idMaitre as IdComposant)
    await tick()
    expect(trace).toEqual(['maitre:ouvre', 'enfant:ouvre', 'enfant:ferme', 'maitre:ferme'])
  })

  it('refuse un second fournisseur pour un nom déjà pris', async () => {
    const { noyau, evenements } = journal()
    await noyau.charger(outil('registre-eu', 'registre'))
    await tick()
    const second = await noyau.charger(outil('registre-bis', 'registre'))
    await tick()

    expect(second).toBeUndefined()
    const erreur = evenements.find((e) => e.type === 'composant-en-erreur')
    expect(erreur).toBeDefined()
    if (erreur?.type === 'composant-en-erreur') {
      expect(erreur.erreur.code).toBe('nom-deja-fourni')
    }
    expect(noyau.introspecter().composants).toHaveLength(1)
  })

  it('convertit un échec d activation en événement, sans lever', async () => {
    const { noyau, evenements } = journal()
    await expect(
      noyau.charger({
        nom: 'fautif',
        presentation: { role: 'Échoue à l activation' },
        applique() {
          throw new Error('registre injoignable')
        },
      }),
    ).resolves.toBeDefined()
    await tick()

    const erreur = evenements.find((e) => e.type === 'composant-en-erreur')
    expect(erreur).toBeDefined()
    if (erreur?.type === 'composant-en-erreur') {
      expect(erreur.erreur.code).toBe('echec-activation')
      expect(erreur.erreur.message).toBe('registre injoignable')
    }
    expect(noyau.introspecter().composants[0]?.etat).toBe('en-erreur')
  })

  it('rend une topologie qui correspond aux composants vivants', async () => {
    const { noyau } = journal()
    await noyau.charger(outil('registre-eu', 'registre'))
    await noyau.charger(agent('verificateur', ['registre']))
    await tick()

    const topologie = noyau.introspecter()
    expect(topologie.composants.map((c) => c.nom).sort()).toEqual(['registre-eu', 'verificateur'])
    expect(topologie.dependances).toEqual([expect.objectContaining({ nom: 'registre' })])

    await noyau.libererTout()
    await tick()
    expect(noyau.introspecter().composants).toHaveLength(0)
  })

  it('réserve un nom de dépendance dès la déclaration, avant toute publication', async () => {
    // Deux composants déclarent « registre » sans jamais publier : c'est la
    // déclaration qui fait le contrat, pas la publication.
    const declarant = (nom: string) => ({
      nom,
      fournit: ['registre'],
      presentation: { role: 'Déclare sans publier' },
      applique() {},
    })
    const { noyau, evenements } = journal()
    await noyau.charger(declarant('premier'))
    await tick()
    const second = await noyau.charger(declarant('second'))
    await tick()

    expect(second).toBeUndefined()
    const erreur = evenements.find((e) => e.type === 'composant-en-erreur')
    expect(erreur?.type === 'composant-en-erreur' && erreur.erreur.code).toBe('nom-deja-fourni')
  })

  it('n annonce jamais actif un composant dont l activation a échoué', async () => {
    const { noyau, evenements } = journal()
    await noyau.charger({
      nom: 'fautif',
      presentation: { role: 'Échoue' },
      applique() {
        throw new Error('boum')
      },
    })
    await tick()

    expect(evenements.some((e) => e.type === 'composant-active')).toBe(false)
    expect(evenements.map((e) => e.type)).toEqual(['composant-cree', 'composant-en-erreur'])
  })

  it('libère le nom réservé quand le fournisseur part', async () => {
    const { noyau } = journal()
    const premier = await noyau.charger(outil('registre-eu', 'registre'))
    await tick()
    await noyau.liberer(premier as IdComposant)
    await tick()
    const remplacant = await noyau.charger(outil('registre-bis', 'registre'))
    await tick()

    expect(remplacant).toBeDefined()
  })

  it('numérote les événements de façon strictement croissante et sans trou', async () => {
    const { noyau, evenements } = journal()
    await noyau.charger(outil('registre-eu', 'registre'))
    await noyau.charger(agent('verificateur', ['registre']))
    await tick()
    await noyau.libererTout()
    await tick()

    const sequences = evenements.map((e) => e.sequence)
    expect(sequences).toEqual(sequences.map((_, index) => index + 1))
  })
})
