import { describe, expect, it } from 'vitest'
import { creerStore } from '../store'
import { creerNoyau } from '../../runtime/noyau'
import type { Composant } from '../../runtime/contrat'

const tick = async () => {
  for (let index = 0; index < 3; index += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

const outil: Composant = {
  nom: 'outil-registre',
  fournit: ['registre'],
  presentation: { role: 'Fournit le registre', technologie: 'registre EU' },
  applique(contexte) {
    contexte.emettre('Charge 412 allégations.')
    contexte.fournir('registre', { allegations: 412 })
    contexte.terminer()
  },
}

const agent: Composant = {
  nom: 'verificateur',
  injecte: ['registre'],
  presentation: { role: 'Vérifie les allégations' },
  applique(contexte) {
    contexte.lire('registre')
  },
}

describe('store', () => {
  it('reflète un vrai run branché sur le noyau', async () => {
    const noyau = creerNoyau()
    const store = creerStore()
    store.brancher(noyau)

    await noyau.charger(agent)
    await tick()
    expect(store.etat.value.noeuds[0]?.etat).toBe('en-attente-de-dependance')

    await noyau.charger(outil)
    await tick()

    const etat = store.etat.value
    expect(etat.noeuds.map((n) => n.etat).sort()).toEqual(['en-cours', 'termine'])
    expect(etat.aretes).toHaveLength(1)
    expect(etat.aretes[0]?.aTransite).toBe(true)
    expect(etat.narration?.message).toBe('Charge 412 allégations.')
    expect(etat.agentsVivants).toBe(2)
  })

  it('cesse de se mettre à jour une fois débranché', async () => {
    const noyau = creerNoyau()
    const store = creerStore()
    const debrancher = store.brancher(noyau)

    await noyau.charger(outil)
    await tick()
    const avant = store.etat.value.derniereSequence
    expect(avant).toBeGreaterThan(0)

    debrancher()
    await noyau.charger(agent)
    await tick()

    expect(store.etat.value.derniereSequence).toBe(avant)
  })

  it('repart d un état vide à la réinitialisation', async () => {
    const noyau = creerNoyau()
    const store = creerStore()
    store.brancher(noyau)
    await noyau.charger(outil)
    await tick()
    expect(store.etat.value.noeuds).not.toHaveLength(0)

    store.reinitialiser()
    expect(store.etat.value.noeuds).toHaveLength(0)
    expect(store.etat.value.narration).toBeUndefined()
    expect(store.etat.value.derniereSequence).toBe(0)
  })

  it('expose un état que rien ne peut muter', async () => {
    const noyau = creerNoyau()
    const store = creerStore()
    store.brancher(noyau)
    await noyau.charger(outil)
    await tick()

    const etat = store.etat.value
    // Vue gèle la valeur exposée : la mutation échoue en mode strict et reste
    // sans effet sinon. TypeScript la refuse déjà à la compilation.
    expect(() => {
      ;(etat.noeuds as unknown as { push: (v: unknown) => void }).push({})
    }).toThrow()
    expect(store.etat.value.noeuds).toHaveLength(1)
  })
})
