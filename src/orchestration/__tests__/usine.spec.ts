// La promesse centrale du produit : le graphe n'existe pas avant le brief, et
// personne — pas même le maître — ne sait ce qu'il contiendra.
import { describe, expect, it } from 'vitest'
import { creerNoyau } from '../../runtime/noyau'
import { lancerUsine, produitDuRun } from '../usine'
import { modeleScripte } from '../../agents/__tests__/modele-scripte'
import { jusqua } from './aide'

const BRIEF = 'Un outil qui repère les allégations thérapeutiques interdites.'

async function courir() {
  const noyau = creerNoyau()
  const nes: string[] = []
  noyau.abonner((evenement) => {
    if (evenement.type === 'composant-cree') nes.push(evenement.nom)
  })
  await lancerUsine(noyau, {
    brief: BRIEF,
    raisonneur: modeleScripte(),
    pasMs: 10,
    delaiStabilisationMs: 4000,
  })
  await jusqua(() => noyau.portesEnAttente().length > 0)
  return { noyau, nes }
}

describe("l'usine lancée sur un besoin", () => {
  it('ne connaît aucun agent au moment du lancement', async () => {
    const noyau = creerNoyau()
    const nes: string[] = []
    noyau.abonner((e) => {
      if (e.type === 'composant-cree') nes.push(e.nom)
    })
    await lancerUsine(noyau, { brief: BRIEF, raisonneur: modeleScripte(), pasMs: 10 })

    // Le premier composant du run est le maître, et il est le seul à naître
    // de l'extérieur : tout le reste dépend de ce qu'un modèle décidera.
    expect(nes[0]).toBe('agent-maitre')
    expect(nes.length).toBeLessThanOrEqual(2)
    await noyau.libererTout()
  })

  it('fait naître un graphe que rien dans le code ne nomme', async () => {
    const { noyau, nes } = await courir()

    expect(nes.length).toBeGreaterThan(3)
    // Aucun de ces noms n'existe dans src/ : ils viennent du modèle.
    for (const nom of nes.filter((n) => n !== 'agent-maitre')) {
      expect(nom).not.toBe('agent-maitre')
    }
    expect(noyau.nomsPublies()).toContain('detecteur')
    await noyau.libererTout()
  })

  it('livre une fonction dont personne ne connaissait le nom', async () => {
    const { noyau } = await courir()
    const produit = produitDuRun(noyau)

    expect(produit).toBeDefined()
    expect(typeof produit?.executer).toBe('function')
    await noyau.libererTout()
  })

  it('borne un chantier qui partirait à la dérive', async () => {
    const noyau = creerNoyau()
    const nes: string[] = []
    noyau.abonner((e) => {
      if (e.type === 'composant-cree') nes.push(e.nom)
    })
    await lancerUsine(noyau, {
      brief: BRIEF,
      raisonneur: modeleScripte(),
      // Deux agents au maximum : le budget n'est pas indicatif.
      budget: { agentsMax: 1, profondeurMax: 1, toursMax: 2, tokensMax: 10_000 },
      pasMs: 10,
      delaiStabilisationMs: 2000,
    })
    await jusqua(() => noyau.portesEnAttente().length > 0)

    expect(nes.filter((n) => n !== 'agent-maitre').length).toBeLessThanOrEqual(2)
    await noyau.libererTout()
  })
})
