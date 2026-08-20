// Le câblage réel de l'application — noyau, store, disposition, brief — testé
// hors composant. Sans ça, on peut casser l'application entière au niveau du
// branchement avec une suite entièrement verte.
import { describe, expect, it, vi } from 'vitest'
import { creerPilote, disposerScenario } from '../pilote'
import { claimCheck } from '../../scenarios/claim-check'
import { topologieDeclaree } from '../lancer'
import type { Scenario } from '../../scenarios/types'

// Le casting déclaré, plus l'agent maître, plus la pièce que le
// constructeur produit fabrique pendant le run.
const NOEUDS_ATTENDUS = claimCheck.casting.length + 2

const tick = async () => {
  for (let index = 0; index < 6; index += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

describe('pilote', () => {
  it('mène un run complet et remplit la vue', async () => {
    const pilote = creerPilote(claimCheck)
    expect(pilote.phase()).toBe('Au repos')

    await pilote.demarrer(claimCheck.brief)
    await tick()

    // Le run s'arrête tout seul sur la porte humaine : rien ne la franchit.
    expect(pilote.phase()).toBe('Décision')
    expect(pilote.fini()).toBe(false)
    expect(pilote.approuver()).toBe(true)
    await tick()

    expect(pilote.store.etat.value.noeuds).toHaveLength(NOEUDS_ATTENDUS)
    expect(pilote.store.etat.value.narration).toBeDefined()
    expect(pilote.phase()).toBe('Terminé')
    expect(pilote.fini()).toBe(true)
    expect(pilote.erreur()).toBeUndefined()
  })

  it('fait réellement piloter le run par le brief saisi', async () => {
    const pilote = creerPilote(claimCheck)
    await pilote.demarrer('Un outil de conformité pour les cosmétiques bio.')
    await tick()

    const ditParLePlanificateur = pilote.store.etat.value.journal
      .filter((m) => m.auteur === 'planificateur')
      .map((m) => m.message)
      .join(' ')
    // Le champ de brief serait décoratif si le run n'en tenait pas compte.
    expect(ditParLePlanificateur).toContain('cosmétiques bio')
  })

  it('remet tout à zéro entre deux runs', async () => {
    const pilote = creerPilote(claimCheck)
    await pilote.demarrer(claimCheck.brief)
    await tick()
    const premier = pilote.store.etat.value.derniereSequence

    await pilote.demarrer(claimCheck.brief)
    await tick()

    expect(pilote.store.etat.value.noeuds).toHaveLength(NOEUDS_ATTENDUS)
    expect(pilote.store.etat.value.derniereSequence).toBeLessThanOrEqual(premier)
    expect(pilote.store.etat.value.incidents).toEqual([])
  })

  it('affiche une erreur au lieu de rejeter quand le scénario est incohérent', async () => {
    const casse: Scenario = {
      ...claimCheck,
      nomsReserves: claimCheck.nomsReserves.filter((r) => r.nom !== 'registre'),
    }
    const pilote = creerPilote(casse)
    await expect(pilote.demarrer(casse.brief)).resolves.toBeUndefined()
    expect(pilote.erreur()).toMatch(/incohérent/)
    expect(pilote.noyau()).toBeUndefined()
  })

  it('libère tout à l arrêt', async () => {
    const pilote = creerPilote(claimCheck)
    await pilote.demarrer(claimCheck.brief)
    await tick()
    const noyau = pilote.noyau()
    expect(noyau?.introspecter().composants.length).toBeGreaterThan(0)

    await pilote.arreter()
    await tick()
    expect(noyau?.introspecter().composants).toHaveLength(0)
    expect(pilote.noyau()).toBeUndefined()
  })
})

describe('la disposition que l application utilise vraiment', () => {
  it('place tout le déclaré, emplacements réservés compris', () => {
    const disposition = disposerScenario(claimCheck)
    expect(disposition.boites.size).toBe(topologieDeclaree(claimCheck).length)
    expect(disposition.boites.has('verificateur-allegations')).toBe(true)
  })

  it('a une place pour chaque nœud qu un run fait apparaître', async () => {
    const pilote = creerPilote(claimCheck)
    await pilote.demarrer(claimCheck.brief)
    await tick()
    pilote.approuver()
    await tick()

    // Un composant vivant sans place déclarée serait invisible : le graphe
    // cesserait d'être la topologie réelle.
    const sansPlace = pilote.store.etat.value.noeuds.filter(
      (noeud) => !pilote.disposition().boites.has(noeud.nom),
    )
    expect(sansPlace.map((n) => n.nom)).toEqual([])
  })
})

describe('la présentation des nœuds', () => {
  it('donne un libellé court à chaque composant déclaré', () => {
    // Sans libellé, le nom technique déborde d'un cadre de 140 px.
    const sansLibelle = topologieDeclaree(claimCheck).filter(
      (composant) => composant.presentation.libelle === undefined,
    )
    expect(sansLibelle.map((c) => c.nom)).toEqual([])
  })
})

describe('le mode de raisonnement', () => {
  it('est déterministe par défaut, et rien ne part sur le réseau', async () => {
    const fetchEspion = vi.spyOn(globalThis, 'fetch')
    const pilote = creerPilote(claimCheck)
    expect(pilote.modeRaisonnement()).toBe('deterministe')

    await pilote.demarrer(claimCheck.brief)
    await tick()
    pilote.approuver()
    await tick()

    expect(fetchEspion).not.toHaveBeenCalled()
    expect(pilote.store.etat.value.tokens).toEqual({ entree: 0, sortie: 0 })
    fetchEspion.mockRestore()
  })

  it('compte les tokens réellement dépensés, et marque l agent branché', async () => {
    const pilote = creerPilote(claimCheck)
    // Un raisonneur factice : ce qui est testé, c'est le chemin du port
    // jusqu'au compteur, pas le fournisseur.
    pilote.brancher({
      origine: 'llm',
      raisonner: async (demande) => ({
        texte: `Rédigé par un modèle. ${demande.instruction}`,
        origine: 'llm' as const,
        tokens: { entree: 1200, sortie: 340 },
      }),
    })
    expect(pilote.modeRaisonnement()).toBe('llm')

    await pilote.demarrer(claimCheck.brief)
    await tick()
    pilote.approuver()
    await tick()

    expect(pilote.store.etat.value.tokens).toEqual({ entree: 1200, sortie: 340 })
    const architecte = pilote.store.etat.value.noeuds.find((n) => n.nom === 'architecte')
    expect(architecte?.branche).toBe(true)
    expect(architecte?.artefact?.corps).toContain('Rédigé par un modèle')
  })

  it('poursuit le run et le dit quand le modèle échoue', async () => {
    const pilote = creerPilote(claimCheck)
    pilote.brancher({
      origine: 'llm',
      raisonner: async (demande) => ({
        texte: demande.repli,
        origine: 'llm' as const,
        echec: 'quota dépassé',
      }),
    })

    await pilote.demarrer(claimCheck.brief)
    await tick()
    pilote.approuver()
    await tick()

    // Le run va au bout : un modèle indisponible ne casse pas la démonstration.
    expect(pilote.phase()).toBe('Terminé')
    const architecte = pilote.store.etat.value.noeuds.find((n) => n.nom === 'architecte')
    expect(architecte?.artefact?.corps).toContain('Repli déterministe : quota dépassé')
    // Aucun token n'a été dépensé : le compteur ne fait pas semblant.
    expect(pilote.store.etat.value.tokens).toEqual({ entree: 0, sortie: 0 })
  })

  it('revient au déterministe quand on débranche', async () => {
    const pilote = creerPilote(claimCheck)
    pilote.brancher({
      origine: 'llm',
      raisonner: async (d) => ({ texte: d.repli, origine: 'llm' as const }),
    })
    pilote.brancher(undefined)
    expect(pilote.modeRaisonnement()).toBe('deterministe')
  })
})

describe('la voie de fabrication', () => {
  const modeleFactice = {
    origine: 'llm' as const,
    raisonner: async (d: { repli: string }) => ({ texte: d.repli, origine: 'llm' as const }),
  }

  it('reste la composition tant que rien n a été consenti', () => {
    const pilote = creerPilote(claimCheck)
    expect(pilote.voieDeFabrication()).toBe('composition')

    pilote.brancher(modeleFactice)
    // Brancher un modèle n'autorise pas à évaluer du code : c'est un
    // arbitrage séparé.
    expect(pilote.voieDeFabrication()).toBe('composition')
  })

  it("passe à l'évaluation seulement branchée et consentie", () => {
    const pilote = creerPilote(claimCheck)
    pilote.brancher(modeleFactice, { evaluation: true })
    expect(pilote.voieDeFabrication()).toBe('evaluation')
  })

  it("refuse l'évaluation sans modèle branché", () => {
    const pilote = creerPilote(claimCheck)
    pilote.brancher(undefined, { evaluation: true })
    expect(pilote.voieDeFabrication()).toBe('composition')
  })

  it('referme la voie par évaluation quand on débranche', () => {
    const pilote = creerPilote(claimCheck)
    pilote.brancher(modeleFactice, { evaluation: true })
    pilote.brancher(undefined)
    expect(pilote.voieDeFabrication()).toBe('composition')
  })

  it('fabrique réellement par évaluation quand la voie est ouverte', async () => {
    const pilote = creerPilote(claimCheck)
    pilote.brancher(modeleFactice, { evaluation: true })
    await pilote.demarrer(claimCheck.brief)
    await tick()
    pilote.approuver()
    await tick()

    const piece = pilote.store.etat.value.noeuds.find((n) => n.nom === 'verificateur-allegations')
    expect(piece?.fabrication?.voie).toBe('evaluation')
    // Et la pièce évaluée marche : elle classe pour de vrai.
    expect(pilote.verificateur()?.('Ce produit guérit les carences.')[0]?.statut).toBe('interdit')
  })
})

describe('la robustesse du branchement', () => {
  it('ne fige pas le run quand le port rejette', async () => {
    const pilote = creerPilote(claimCheck)
    pilote.brancher({
      origine: 'llm',
      raisonner: async () => {
        throw new Error('boum')
      },
    })

    await pilote.demarrer(claimCheck.brief)
    await tick()
    pilote.approuver()
    await tick()

    // Un port qui lève ne doit pas laisser tout l'aval en attente
    // indéfiniment, avec un graphe qui n'affiche rien d'anormal.
    expect(pilote.phase()).toBe('Terminé')
    const architecte = pilote.store.etat.value.noeuds.find((n) => n.nom === 'architecte')
    expect(architecte?.etat).toBe('termine')
    expect(architecte?.repli).toContain('boum')
    expect(architecte?.artefact?.corps).toContain('Repli déterministe : boum')
  })

  it('dit dans la mémoire de run quel mode a réellement servi', async () => {
    const pilote = creerPilote(claimCheck)
    pilote.brancher({
      origine: 'llm',
      raisonner: async (d: { repli: string }) => ({ texte: d.repli, origine: 'llm' as const }),
    })
    await pilote.demarrer(claimCheck.brief)
    await tick()

    const memoire = pilote.store.etat.value.noeuds.find((n) => n.nom === 'agent-maitre')
    expect(memoire?.artefact?.corps).toContain('Mode LLM branché')
    expect(memoire?.artefact?.corps).not.toContain('Mode déterministe')
  })

  it('dit dans la mémoire de run quelle voie de fabrication a servi', async () => {
    const pilote = creerPilote(claimCheck)
    pilote.brancher(
      {
        origine: 'llm',
        raisonner: async (d: { repli: string }) => ({ texte: d.repli, origine: 'llm' as const }),
      },
      { evaluation: true },
    )
    await pilote.demarrer(claimCheck.brief)
    await tick()

    const memoire = pilote.store.etat.value.noeuds.find((n) => n.nom === 'agent-maitre')
    expect(memoire?.artefact?.corps).toContain('évaluation de code')
  })
})
