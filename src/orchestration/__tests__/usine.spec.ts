// La promesse centrale du produit : le graphe n'existe pas avant le brief.
// Ce test la vérifie sur le vrai noyau, sans interface.
import { describe, expect, it } from 'vitest'
import { creerNoyau } from '../../runtime/noyau'
import { lancerUsine } from '../usine'
import type { EvenementRun } from '../../runtime/evenements'
import type { Verdict } from '../../runtime/fabrique/primitives'

interface Trace {
  evenements: EvenementRun[]
  nomsCrees: string[]
}

async function courir(
  brief: string,
): Promise<{ noyau: ReturnType<typeof creerNoyau>; trace: Trace }> {
  const noyau = creerNoyau()
  const trace: Trace = { evenements: [], nomsCrees: [] }
  noyau.abonner((evenement) => {
    trace.evenements.push(evenement)
    if (evenement.type === 'composant-cree') trace.nomsCrees.push(evenement.nom)
  })
  await lancerUsine(noyau, { brief, delaiParVague: 2000, cadenceMs: 0 })
  // Le plan est épuisé quand la suite fixe est chargée : la porte est le
  // dernier composant que le maître fait naître avant la livraison.
  for (let i = 0; i < 200 && !trace.nomsCrees.includes('porte-humaine'); i += 1) {
    await new Promise((resoudre) => setTimeout(resoudre, 10))
  }
  return { noyau, trace }
}

describe("l'usine lancée sur un brief", () => {
  it("ne connaît aucun agent avant d'avoir lu le brief", async () => {
    const noyau = creerNoyau()
    const nomsCrees: string[] = []
    noyau.abonner((e) => {
      if (e.type === 'composant-cree') nomsCrees.push(e.nom)
    })
    await lancerUsine(noyau, { brief: 'Vérifier mes allégations santé.', cadenceMs: 0 })

    // Le premier composant du run est le maître, et il est seul à naître de
    // l'extérieur : tout le reste dépend de ce qu'il aura décidé.
    expect(nomsCrees[0]).toBe('agent-maitre')
    expect(nomsCrees.length).toBeLessThanOrEqual(2)
    await noyau.libererTout()
  })

  it('ne fait pas le même graphe pour deux briefs différents', async () => {
    const simple = await courir('Vérifier des allégations santé.')
    const riche = await courir(
      'Un écran pour coller mon texte publicitaire, des tests de non-régression, une API, et une relecture juridique stricte des formulations négatives.',
    )

    expect(riche.trace.nomsCrees.length).toBeGreaterThan(simple.trace.nomsCrees.length)
    expect(riche.trace.nomsCrees).toContain('constructeur-interface')
    expect(simple.trace.nomsCrees).not.toContain('constructeur-interface')
    // Le corpus n'est pas le même non plus : le brief le désigne.
    const memoire = (noyau: typeof simple.noyau) =>
      noyau.produit<{ secteur: string }>('memoire')?.secteur
    expect(memoire(simple.noyau)).toContain('Allégations')
    expect(memoire(riche.noyau)).toContain('Pratiques commerciales')

    await simple.noyau.libererTout()
    await riche.noyau.libererTout()
  })

  it('fait pousser le graphe : les agents naissent après le maître, pas avec lui', async () => {
    const { noyau, trace } = await courir('Vérifier des allégations santé.')

    const rang = (nom: string) => trace.nomsCrees.indexOf(nom)
    expect(rang('agent-maitre')).toBe(0)
    // Un agent ne naît qu'après celui dont il dépend : la vague suivante
    // attend une publication réelle, jamais un minuteur.
    expect(rang('source-de-verite')).toBeLessThan(rang('fabricant-du-produit'))
    expect(rang('fabricant-du-produit')).toBeLessThan(rang('sceptique'))
    expect(rang('porte-humaine')).toBeGreaterThan(rang('sceptique'))

    await noyau.libererTout()
  })

  it("fabrique l'outil décidé par le plan, et le livre s'il est approuvé", async () => {
    const { noyau, trace } = await courir('Vérifier des allégations santé.')

    const fabrique = trace.evenements.find((e) => e.type === 'composant-fabrique')
    expect(fabrique).toBeDefined()

    const porte = noyau.portesEnAttente()[0]
    expect(porte).toBeDefined()
    expect(noyau.decider(porte as never, 'approuve')).toBe(true)
    await noyau.attendre('livrable', 3000)

    const verifier = noyau.produit<(texte: string) => readonly Verdict[]>('verificateur')
    expect(typeof verifier).toBe('function')
    const verdicts = verifier?.('Ce produit guérit l’arthrose.') ?? []
    expect(verdicts[0]?.statut).toBe('interdit')
    expect(verdicts[0]?.source).toBeTruthy()

    await noyau.libererTout()
  })
})
