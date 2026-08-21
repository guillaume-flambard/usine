// La promesse centrale, prouvée sans navigateur : rien n'est écrit d'avance.
// Un modèle factice mais scripté décide qui existe, ce qu'ils se demandent, et
// le code de l'outil. Aucun nom d'agent de ce test n'apparaît dans le produit.
import { describe, expect, it } from 'vitest'
import { creerNoyau } from '../../runtime/noyau'
import { lancerUsine, produitDuRun } from '../../orchestration/usine'
import type { EvenementRun } from '../../runtime/evenements'
import { modeleScripte } from './modele-scripte'

async function runLibre() {
  const noyau = creerNoyau()
  const evenements: EvenementRun[] = []
  noyau.abonner((evenement) => evenements.push(evenement))
  await lancerUsine(noyau, {
    brief: 'Un outil qui repère les allégations thérapeutiques interdites.',
    raisonneur: modeleScripte(),
    pasMs: 10,
    delaiStabilisationMs: 4000,
  })
  // La porte s'ouvre quand le chantier s'est stabilisé : c'est le seul signal.
  const fin = Date.now() + 8000
  while (Date.now() < fin && noyau.portesEnAttente().length === 0) {
    await new Promise((suite) => setTimeout(suite, 10))
  }
  return { noyau, evenements }
}

describe("l'usine qui s'invente", () => {
  it('fait naître des agents dont aucun nom ne figure dans le produit', async () => {
    const { noyau, evenements } = await runLibre()
    const nes = evenements
      .filter((e) => e.type === 'composant-cree')
      .map((e) => (e as { nom: string }).nom)

    expect(nes).toContain('agent-maitre')
    expect(nes).toContain('juriste')
    expect(nes).toContain('artisan')
    // L'outil aussi est né pendant le run.
    expect(nes).toContain('detecteur')
    await noyau.libererTout()
  })

  it('laisse un agent en créer un autre, et le graphe le montre', async () => {
    const { noyau, evenements } = await runLibre()
    const parent = (nom: string) => {
      const cree = evenements.find((e) => e.type === 'composant-cree' && e.nom === nom)
      const id = cree === undefined ? undefined : (cree as { id: string }).id
      return noyau.introspecter().composants.find((c) => c.id === id)?.parent
    }
    const maitre = evenements.find((e) => e.type === 'composant-cree' && e.nom === 'agent-maitre')
    // Le juriste n'a pas été chargé par l'orchestration : c'est le maître.
    expect(parent('juriste')).toBe((maitre as { id: string }).id)
    // Et l'outil a été chargé par l'artisan, pas par le maître.
    const artisan = evenements.find((e) => e.type === 'composant-cree' && e.nom === 'artisan')
    expect(parent('detecteur')).toBe((artisan as { id: string }).id)
    await noyau.libererTout()
  })

  it('laisse deux agents se parler, question et réponse comprises', async () => {
    const { noyau, evenements } = await runLibre()
    const question = evenements.find((e) => e.type === 'question-posee')
    const reponse = evenements.find((e) => e.type === 'reponse-donnee')

    expect(question).toBeDefined()
    expect((question as { question: string }).question).toContain('article')
    expect(reponse).toBeDefined()
    expect((reponse as { reponse: string }).reponse).toContain('article')
    await noyau.libererTout()
  })

  it("exécute l'outil que l'agent a écrit, et il marche", async () => {
    const { noyau } = await runLibre()
    const produit = produitDuRun(noyau)

    expect(produit?.nom).toBe('detecteur')
    const sortie = produit?.executer('Ce produit guérit tout. Il est agréable.') as {
      phrase: string
      interdit: boolean
    }[]
    expect(sortie).toHaveLength(2)
    expect(sortie[0]?.interdit).toBe(true)
    expect(sortie[1]?.interdit).toBe(false)
    await noyau.libererTout()
  })

  it('ouvre la porte sur ce qui existe, pas sur ce qui était prévu', async () => {
    const { noyau, evenements } = await runLibre()
    const porte = evenements.find((e) => e.type === 'porte-atteinte')
    const objet = (porte as { objet: { resume: string; objection: string } }).objet

    expect(objet.resume).toContain('agents ont été créés')
    expect(objet.resume).toContain('écrits et chargés à chaud')
    expect(objet.objection).toContain('trois motifs')
    expect(noyau.portesEnAttente()).toHaveLength(1)
    await noyau.libererTout()
  })

  it('rend le code de chaque outil consultable, tel qu il tourne', async () => {
    const { noyau, evenements } = await runLibre()
    const fabrique = evenements.find((e) => e.type === 'composant-fabrique')
    const fabrication = (fabrique as { fabrication: { source: string; voie: string } }).fabrication

    expect(fabrication.voie).toBe('evaluation')
    // Le code affiché est celui qui a été évalué, pas une reformulation.
    expect(fabrication.source).toContain('interdit')
    expect(typeof noyau.produit('detecteur')).toBe('function')
    await noyau.libererTout()
  })
})

describe('sans modèle branché', () => {
  it('ne fait naître aucun agent, et ne prétend pas le contraire', async () => {
    const noyau = creerNoyau()
    const nes: string[] = []
    noyau.abonner((e) => {
      if (e.type === 'composant-cree') nes.push(e.nom)
    })
    await lancerUsine(noyau, { brief: 'peu importe', pasMs: 10, delaiStabilisationMs: 500 })
    const fin = Date.now() + 4000
    while (Date.now() < fin && noyau.portesEnAttente().length === 0) {
      await new Promise((suite) => setTimeout(suite, 10))
    }

    expect(nes).toEqual(['agent-maitre'])
    expect(produitDuRun(noyau)).toBeUndefined()
    await noyau.libererTout()
  })
})
