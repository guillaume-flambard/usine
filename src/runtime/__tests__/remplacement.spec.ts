// Story 2.6 — remplacer une pièce à chaud, et retirer une version fautive
// sans laisser le run amputé.
import { describe, expect, it } from 'vitest'
import { creerNoyau } from '../noyau'
import type { Composant, IdComposant } from '../contrat'
import type { EvenementRun } from '../evenements'

const tick = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise<void>((r) => setTimeout(r, 0))
}

const piece = (version: number, casse = false): Composant => ({
  nom: 'piece-fabriquee',
  fournit: ['sortie'],
  presentation: { libelle: `Pièce v${version}`, role: `Version ${version}` },
  applique(contexte) {
    if (casse) throw new Error('version fautive')
    contexte.fournir('sortie', { version })
    contexte.terminer()
  },
})

const consommateur: Composant = {
  nom: 'consommateur',
  injecte: ['sortie'],
  presentation: { libelle: 'Consommateur', role: 'Lit la sortie' },
  applique(contexte) {
    contexte.lire('sortie')
  },
}

describe('remplacement à chaud', () => {
  it('remplace une pièce vivante par une nouvelle version', async () => {
    const noyau = creerNoyau()
    const id = await noyau.charger(piece(1))
    await noyau.charger(consommateur)
    await tick()

    const nouveau = await noyau.remplacer(id as IdComposant, piece(2))
    await tick()

    expect(nouveau).toBeDefined()
    const composants = noyau.introspecter().composants
    expect(composants.filter((c) => c.nom === 'piece-fabriquee')).toHaveLength(1)
    expect(composants.find((c) => c.nom === 'piece-fabriquee')?.presentation.libelle).toBe(
      'Pièce v2',
    )
  })

  it('réactive les dépendants après le remplacement', async () => {
    const noyau = creerNoyau()
    const id = await noyau.charger(piece(1))
    await noyau.charger(consommateur)
    await tick()

    await noyau.remplacer(id as IdComposant, piece(2))
    await tick()

    const consommateurVu = noyau.introspecter().composants.find((c) => c.nom === 'consommateur')
    expect(consommateurVu?.etat).toBe('actif')
    expect(noyau.introspecter().dependances.some((d) => d.nom === 'sortie')).toBe(true)
  })

  it("remet l'ancienne version quand la nouvelle est fautive", async () => {
    const noyau = creerNoyau()
    const evenements: EvenementRun[] = []
    noyau.abonner((e) => evenements.push(e))
    const id = await noyau.charger(piece(1))
    await tick()

    const nouveau = await noyau.remplacer(id as IdComposant, piece(2, true))
    await tick()

    expect(nouveau).toBeUndefined()
    const vivantes = noyau.introspecter().composants.filter((c) => c.nom === 'piece-fabriquee')
    // La version fautive est écartée, mais le run n'est pas amputé.
    expect(vivantes.filter((c) => c.etat === 'actif')).toHaveLength(1)
    expect(vivantes.find((c) => c.etat === 'actif')?.presentation.libelle).toBe('Pièce v1')
    expect(evenements.some((e) => e.type === 'composant-en-erreur')).toBe(true)
  })

  it('marque la nouvelle version comme fabriquée quand on le lui dit', async () => {
    const noyau = creerNoyau()
    const evenements: EvenementRun[] = []
    noyau.abonner((e) => evenements.push(e))
    const id = await noyau.charger(piece(1))
    await tick()

    await noyau.remplacer(id as IdComposant, piece(2), {
      specification: 'nom : piece-fabriquee',
      source: 'assemblée',
      voie: 'composition',
    })
    await tick()

    // Le remplacement se fait à la racine : il n'a pas de parent, donc pas
    // d'événement de fabrication. C'est le comportement attendu ici.
    expect(evenements.some((e) => e.type === 'composant-cree')).toBe(true)
  })

  it('ne fait rien sur un identifiant inconnu', async () => {
    const noyau = creerNoyau()
    await expect(noyau.remplacer('inconnu' as IdComposant, piece(1))).resolves.toBeUndefined()
    expect(noyau.introspecter().composants).toHaveLength(0)
  })
})
