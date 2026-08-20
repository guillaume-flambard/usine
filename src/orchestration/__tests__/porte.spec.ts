// Epic 3 — la décision humaine. Le run s'arrête, montre sur quoi il demande
// de trancher, et la décision a des conséquences visibles.
import { describe, expect, it } from 'vitest'
import { creerPilote } from '../pilote'
import { claimCheck } from '../../scenarios/claim-check'

const tick = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise<void>((r) => setTimeout(r, 0))
}

async function jusquALaPorte() {
  const pilote = creerPilote(claimCheck)
  await pilote.demarrer(claimCheck.brief)
  await tick()
  return pilote
}

describe("la porte s'arrête et attend", () => {
  it('arrête le run sans que rien ne la franchisse', async () => {
    const pilote = await jusquALaPorte()

    expect(pilote.phase()).toBe('Décision')
    expect(pilote.store.etat.value.porte?.decision).toBeUndefined()
    // Le temps ne franchit pas la porte : on attend, longtemps s'il le faut.
    await tick()
    await tick()
    expect(pilote.store.etat.value.porte?.decision).toBeUndefined()
    expect(pilote.store.etat.value.noeuds.find((n) => n.nom === 'livraison')?.etat).toBe(
      'en-attente-de-dependance',
    )
  })

  it('montre ce qui a été produit et ce que le sceptique a relevé', async () => {
    const pilote = await jusquALaPorte()
    const porte = pilote.store.etat.value.porte

    expect(porte?.objet.resume).toContain('fabriquée pendant le run')
    expect(porte?.objet.resume).toContain('Approuver')
    // Une décision qui ne porterait sur rien ne vaudrait rien.
    expect(porte?.objet.objection).toContain('reformulée')
  })
})

describe('approuver', () => {
  it('poursuit le run jusqu à la livraison', async () => {
    const pilote = await jusquALaPorte()
    expect(pilote.approuver()).toBe(true)
    await tick()

    expect(pilote.store.etat.value.porte?.decision).toBe('approuve')
    expect(pilote.phase()).toBe('Terminé')
    expect(pilote.store.etat.value.noeuds.find((n) => n.nom === 'livraison')?.etat).toBe('termine')
  })

  it('trace la décision dans le journal et dans un artefact', async () => {
    const pilote = await jusquALaPorte()
    pilote.approuver()
    await tick()

    const porteNoeud = pilote.store.etat.value.noeuds.find((n) => n.nom === 'porte-humaine')
    expect(porteNoeud?.artefact?.titre).toBe('Décision humaine')
    expect(porteNoeud?.artefact?.corps).toContain('Approuvée')
    expect(pilote.store.etat.value.journal.some((m) => m.message.includes('approuvée'))).toBe(true)
  })

  it('ne se prend pas deux fois', async () => {
    const pilote = await jusquALaPorte()
    expect(pilote.approuver()).toBe(true)
    await tick()
    expect(pilote.approuver()).toBe(false)
  })
})

describe('écarter', () => {
  it('empêche la livraison', async () => {
    const pilote = await jusquALaPorte()
    expect(await pilote.ecarter()).toBe(true)
    await tick()

    expect(pilote.store.etat.value.porte?.decision).toBe('ecarte')
    expect(pilote.store.etat.value.noeuds.find((n) => n.nom === 'livraison')?.etat).not.toBe(
      'termine',
    )
  })

  it('montre la rétractation au lieu de figer le graphe', async () => {
    const pilote = await jusquALaPorte()
    const piece = () =>
      pilote.store.etat.value.noeuds.find((n) => n.nom === 'verificateur-allegations')
    expect(piece()?.etat).toBe('termine')

    await pilote.ecarter()
    await tick()

    // La pièce fabriquée est libérée, et ça se voit.
    expect(piece()?.etat).toBe('libere')
    // La porte, elle, reste visible : c'est la trace de ce qui a été tranché.
    expect(pilote.store.etat.value.porte?.decision).toBe('ecarte')
  })

  it('consigne le refus dans un artefact consultable', async () => {
    const pilote = await jusquALaPorte()
    await pilote.ecarter()
    await tick()

    const porteNoeud = pilote.store.etat.value.noeuds.find((n) => n.nom === 'porte-humaine')
    expect(porteNoeud?.artefact?.corps).toContain('Écartée')
  })

  it('ne se prend pas après une approbation', async () => {
    const pilote = await jusquALaPorte()
    pilote.approuver()
    await tick()
    expect(await pilote.ecarter()).toBe(false)
  })
})

describe("l'objection du sceptique", () => {
  it("cite un élément précis d'un artefact produit en amont", async () => {
    const pilote = await jusquALaPorte()
    const objection = pilote.store.etat.value.porte?.objet.objection ?? ''

    // Une objection générique ne satisferait pas l'exigence : elle doit
    // s'appuyer sur ce qui a réellement été produit.
    expect(objection).toMatch(/\d+ sorties/)
    expect(objection).toMatch(/\d+ critères/)
  })
})
