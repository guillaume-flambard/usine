// Epic 2 vu de bout en bout : l'usine fabrique une pièce pendant le run,
// la charge à sa place réservée, et tout ce que les agents écrivent est
// consultable.
import { describe, expect, it } from 'vitest'
import { creerPilote } from '../pilote'
import { claimCheck } from '../../scenarios/claim-check'

const tick = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise<void>((r) => setTimeout(r, 0))
}

/** Un run mené jusqu'au bout : la porte humaine l'arrête, on approuve. */
async function run() {
  const pilote = creerPilote(claimCheck)
  await pilote.demarrer(claimCheck.brief)
  await tick()
  pilote.approuver()
  await tick()
  return pilote
}

describe("l'usine fabrique ses propres pièces", () => {
  it('produit un composant qui n existait pas avant le run', async () => {
    const pilote = await run()
    const piece = pilote.store.etat.value.noeuds.find((n) => n.nom === 'verificateur-allegations')

    expect(piece).toBeDefined()
    expect(piece?.fabrication).toBeDefined()
    expect(piece?.fabrication?.voie).toBe('composition')
    expect(piece?.etat).toBe('termine')
  })

  it('la charge à la place qui lui était tenue, sans déplacer personne', async () => {
    const pilote = await run()
    const place = pilote.disposition().boites.get('verificateur-allegations')
    expect(place).toBeDefined()

    const sansPlace = pilote.store.etat.value.noeuds.filter(
      (n) => !pilote.disposition().boites.has(n.nom),
    )
    expect(sansPlace).toEqual([])
  })

  it('rend consultables la spécification et le code réellement chargé', async () => {
    const pilote = await run()
    const piece = pilote.store.etat.value.noeuds.find((n) => n.nom === 'verificateur-allegations')

    expect(piece?.fabrication?.specification).toContain('étapes :')
    // Le code affiché est celui qui tourne : il nomme les trois primitives.
    for (const primitive of ['decouper-allegations', 'classer-par-regles', 'exiger-une-source']) {
      expect(piece?.fabrication?.source).toContain(primitive)
    }
  })

  it('attribue la pièce au composant qui l a fabriquée', async () => {
    const pilote = await run()
    const piece = pilote.store.etat.value.noeuds.find((n) => n.nom === 'verificateur-allegations')
    const fabricant = pilote.store.etat.value.noeuds.find((n) => n.id === piece?.fabriquePar)
    expect(fabricant?.nom).toBe('constructeur-produit')
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

    // Le minimum exigé : un découpage en histoires, une décision
    // d'architecture, et la mémoire de run.
    expect(avecArtefact).toContain('planificateur')
    expect(avecArtefact).toContain('architecte')
    expect(avecArtefact).toContain('agent-maitre')
    expect(avecArtefact).toContain('sceptique')
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
      .filter((n) => n.artefact !== undefined && n.nom !== 'constructeur-produit')
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
    expect(maitre?.artefact?.titre).toBe('Mémoire de run')
    expect(maitre?.artefact?.corps).toContain('Secteur :')
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
    expect(fabriques).toEqual(['verificateur-allegations'])
  })
})
