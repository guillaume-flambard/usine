// Epic 2 vu de bout en bout : l'usine fabrique une pièce pendant le run,
// la charge à sa place réservée, et tout ce que les agents écrivent est
// consultable.
import { describe, expect, it } from 'vitest'
import { runApprouve, runTermine } from './aide'

/** Un run mené jusqu'au bout : la porte humaine l'arrête, on approuve. */
const run = () => runTermine()

describe("l'usine fabrique ses propres pièces", () => {
  it('produit un composant qui n existait pas avant le run', async () => {
    const pilote = await run()
    const piece = pilote.store.etat.value.noeuds.find((n) => n.fabrication !== undefined)

    expect(piece).toBeDefined()
    expect(piece?.fabrication).toBeDefined()
    expect(piece?.fabrication?.voie).toBe('composition')
    expect(piece?.etat).toBe('termine')
  })

  it('la charge à la place qui lui était tenue, sans déplacer personne', async () => {
    const pilote = await run()
    // Il n'y a plus de place tenue d'avance : la disposition suit le graphe.
    // Ce qui doit rester vrai, c'est que tout ce qui vit a une place.
    const piece = pilote.store.etat.value.noeuds.find((n) => n.fabrication !== undefined)
    expect(pilote.disposition.value.boites.get(piece?.nom ?? '')).toBeDefined()

    const sansPlace = pilote.store.etat.value.noeuds.filter(
      (n) => !pilote.disposition.value.boites.has(n.nom),
    )
    expect(sansPlace).toEqual([])
  })

  it('rend consultables la spécification et le code réellement chargé', async () => {
    const pilote = await run()
    const piece = pilote.store.etat.value.noeuds.find((n) => n.fabrication !== undefined)

    expect(piece?.fabrication?.specification).toContain('étapes :')
    // Le code affiché est celui qui tourne : il nomme les trois primitives.
    for (const primitive of ['decouper-allegations', 'classer-par-regles', 'exiger-une-source']) {
      expect(piece?.fabrication?.source).toContain(primitive)
    }
  })

  it('attribue la pièce au composant qui l a fabriquée', async () => {
    const pilote = await run()
    const piece = pilote.store.etat.value.noeuds.find((n) => n.fabrication !== undefined)
    const fabricant = pilote.store.etat.value.noeuds.find((n) => n.id === piece?.fabriquePar)
    // Le nom du fabricant vient du plan : ce qui compte est qu'il existe et
    // que la pièce lui soit attribuée, pas qu'il s'appelle comme hier.
    expect(fabricant).toBeDefined()
    expect(
      pilote.plan()?.agents.some((a) => a.nom === fabricant?.nom && a.outil !== undefined),
    ).toBe(true)
  })
})

// La compatibilité avec une politique de sécurité stricte est prouvée à
// l'unité dans src/runtime/fabrique/__tests__ et sera rejouée dans un vrai
// navigateur sous CSP en story 6.3 : neutraliser `Function` globalement ici
// casserait l'outillage de test lui-même, pas la fabrication.
describe('ce que les agents écrivent', () => {
  it('donne un artefact consultable à chaque agent qui produit quelque chose', async () => {
    const pilote = await run()
    const avecArtefact = pilote.store.etat.value.noeuds
      .filter((n) => n.artefact !== undefined)
      .map((n) => n.nom)

    // Le minimum exigé : le plan du run, et un artefact pour chaque agent
    // que ce plan a fait naître. Les noms viennent du plan, pas d'ici.
    expect(avecArtefact).toContain('agent-maitre')
    for (const agent of pilote.plan()?.agents ?? []) {
      expect(avecArtefact, agent.nom).toContain(agent.nom)
    }
    expect((pilote.plan()?.agents ?? []).length).toBeGreaterThan(2)
  })

  it('dit de quoi chaque artefact découle', async () => {
    const pilote = await run()
    const artefacts = pilote.store.etat.value.noeuds
      .map((n) => n.artefact)
      .filter((a): a is NonNullable<typeof a> => a !== undefined)

    expect(artefacts.length).toBeGreaterThanOrEqual(4)
    for (const artefact of artefacts) {
      expect(artefact.decouleDe, artefact.titre).toBeDefined()
    }
  })

  it("n'emploie aucun identifiant technique dans le corps des artefacts", async () => {
    const pilote = await run()
    const corps = pilote.store.etat.value.noeuds
      .filter((n) => n.artefact !== undefined && n.fabrication === undefined)
      .filter((n) => pilote.plan()?.agents.every((a) => a.nom !== n.nom || a.outil === undefined))
      .map((n) => n.artefact?.corps ?? '')
      .join('\n')

    // Les artefacts doivent se lire sans connaître le code.
    for (const jargon of ['.ts', 'IdComposant', 'contexte.', 'undefined']) {
      expect(corps, jargon).not.toContain(jargon)
    }
  })

  it('tient une mémoire de run consultable', async () => {
    const pilote = await run()
    const maitre = pilote.store.etat.value.noeuds.find((n) => n.nom === 'agent-maitre')
    // Le maître publie désormais le plan qu'il s'est donné : c'est lui, la
    // mémoire du run, et il doit être lisible.
    expect(maitre?.artefact?.titre).toBe('Plan du run')
    expect(maitre?.artefact?.corps).toContain('Corpus :')
    expect(maitre?.artefact?.corps).toContain('fabrique « verificateur »')
  })
})

describe('la pièce fabriquée tourne vraiment pendant le run', () => {
  it('est exécutée par la livraison sur un texte témoin, avec des verdicts sourcés', async () => {
    const pilote = await run()
    const livraison = pilote.store.etat.value.noeuds.find((n) => n.nom === 'livraison')

    // Une pièce qui se contenterait d'enregistrer une fonction ne prouverait
    // rien : la livraison la fait tourner avant de la monter.
    expect(livraison?.artefact?.titre).toBe('Contrôle avant livraison')
    expect(livraison?.artefact?.corps).toContain('interdit')
    expect(livraison?.artefact?.corps).toContain('autorisé')
    expect(livraison?.artefact?.corps).toContain('à vérifier')
    expect(livraison?.artefact?.corps).toContain('1924/2006')
    // La livraison dit de quelle décision humaine elle procède.
    expect(livraison?.artefact?.corps).toContain('Décision humaine : approuvée.')
    expect(livraison?.artefact?.decouleDe).toBe('la décision humaine')
  })

  it('ne laisse aucun verdict tranché sans source', async () => {
    const pilote = await run()
    const corps = pilote.store.etat.value.noeuds.find((n) => n.nom === 'livraison')?.artefact?.corps
    const lignes = (corps ?? '').split('\n').filter((l) => l.startsWith('— «'))
    expect(lignes.length).toBeGreaterThan(0)
    for (const ligne of lignes) {
      const tranche = ligne.includes('interdit') || ligne.includes('autorisé')
      // Tranché implique une source citée entre parenthèses.
      if (tranche) expect(ligne, ligne).toMatch(/\(.+\)$/)
    }
  })

  it('marque comme fabriqué exactement ce qui l a été', async () => {
    const pilote = await run()
    const fabriques = pilote.store.etat.value.noeuds
      .filter((n) => n.fabrication !== undefined)
      .map((n) => n.nom)
    expect(fabriques).toEqual(['verificateur'])
  })
})
