// Le câblage réel de l'application — noyau, store, disposition, brief — testé
// hors composant. Sans ça, on peut casser l'application entière au niveau du
// branchement avec une suite entièrement verte.
import { describe, expect, it, vi } from 'vitest'
import { creerPilote } from '../pilote'
import type { Raisonneur } from '../../runtime/raisonneur'
import { BRIEF_SANTE, jusqua, runJusquALaPorte, runTermine } from './aide'

/** Combien d'appels au modèle un run fait réellement : un par plan, un par agent qui raisonne. */
const appelsAuModele = (pilote: ReturnType<typeof creerPilote>) =>
  1 +
  (pilote.plan()?.agents ?? []).filter(
    (agent) => agent.outil === undefined && !agent.fournit.includes('registre'),
  ).length

const modele = (raisonner: Raisonneur['raisonner']): Raisonneur => ({ origine: 'llm', raisonner })

const MODELE_MUET = modele(async (demande) => ({ texte: demande.repli, origine: 'llm' as const }))

describe('pilote', () => {
  it('mène un run complet et remplit la vue', async () => {
    const pilote = creerPilote()
    expect(pilote.phase()).toBe('Au repos')

    await pilote.demarrer(BRIEF_SANTE)
    await jusqua(() => pilote.phase() === 'Décision')

    // Le run s'arrête tout seul sur la porte humaine : rien ne la franchit.
    expect(pilote.phase()).toBe('Décision')
    expect(pilote.fini()).toBe(false)
    expect(pilote.approuver()).toBe(true)
    await jusqua(() => pilote.fini())

    expect(pilote.store.etat.value.noeuds.length).toBeGreaterThan(4)
    expect(pilote.store.etat.value.narration).toBeDefined()
    expect(pilote.phase()).toBe('Terminé')
    expect(pilote.erreur()).toBeUndefined()
  })

  it('fait réellement piloter le run par le brief saisi', async () => {
    const pilote = creerPilote()
    await pilote.demarrer('Un outil de conformité pour les cosmétiques bio, avec un écran.')
    await jusqua(() => pilote.plan() !== undefined)

    const plan = pilote.plan()
    const maitre = pilote.store.etat.value.noeuds.find((n) => n.nom === 'agent-maitre')
    // Le champ de brief serait décoratif si le graphe n'en découlait pas.
    expect(maitre?.artefact?.corps).toContain('cosmétiques bio')
    expect(plan?.agents.map((a) => a.nom)).toContain('constructeur-interface')
    await pilote.arreter()
  })

  it('remet tout à zéro entre deux runs', async () => {
    const pilote = await runJusquALaPorte()
    const premier = pilote.store.etat.value.derniereSequence

    await pilote.demarrer(BRIEF_SANTE)
    await jusqua(() => pilote.phase() === 'Décision')

    expect(pilote.store.etat.value.derniereSequence).toBeLessThanOrEqual(premier)
    expect(pilote.store.etat.value.incidents).toEqual([])
    await pilote.arreter()
  })

  it('libère tout à l arrêt', async () => {
    const pilote = await runJusquALaPorte()
    const noyau = pilote.noyau()
    expect(noyau?.introspecter().composants.length).toBeGreaterThan(0)

    await pilote.arreter()
    expect(noyau?.introspecter().composants).toHaveLength(0)
    expect(pilote.noyau()).toBeUndefined()
  })
})

describe('la présentation des nœuds', () => {
  it('donne un libellé court à chaque nœud que le run fait apparaître', async () => {
    // Sans libellé, le nom technique déborde d'un cadre de 140 px.
    const pilote = await runTermine()
    const sansLibelle = pilote.store.etat.value.noeuds.filter(
      (noeud) => noeud.presentation.libelle === undefined,
    )
    expect(sansLibelle.map((n) => n.nom)).toEqual([])
  })

  it("n'affiche une technologie que sur les nœuds qui en font tourner une", async () => {
    const pilote = await runTermine()
    for (const noeud of pilote.store.etat.value.noeuds) {
      if (noeud.presentation.technologie === undefined) continue
      // Seuls la source de vérité et le fabricant exécutent quelque chose de
      // nommable : afficher une pile ailleurs serait un mensonge de casting.
      expect(
        noeud.fournit.includes('registre') ||
          (pilote.plan()?.agents ?? []).some((a) => a.nom === noeud.nom && a.outil !== undefined),
        noeud.nom,
      ).toBe(true)
    }
  })
})

describe('le mode de raisonnement', () => {
  it('est déterministe par défaut, et rien ne part sur le réseau', async () => {
    const fetchEspion = vi.spyOn(globalThis, 'fetch')
    const pilote = creerPilote()
    expect(pilote.modeRaisonnement()).toBe('deterministe')

    await pilote.demarrer(BRIEF_SANTE)
    await jusqua(() => pilote.phase() === 'Décision')
    pilote.approuver()
    await jusqua(() => pilote.fini())

    expect(fetchEspion).not.toHaveBeenCalled()
    expect(pilote.store.etat.value.tokens).toEqual({ entree: 0, sortie: 0 })
    fetchEspion.mockRestore()
    await pilote.arreter()
  })

  it('compte les tokens réellement dépensés, et marque les agents branchés', async () => {
    const pilote = creerPilote()
    // Un raisonneur factice : ce qui est testé, c'est le chemin du port
    // jusqu'au compteur, pas le fournisseur.
    pilote.brancher(
      modele(async (demande) => ({
        texte: `Rédigé par un modèle. ${demande.instruction}`,
        origine: 'llm' as const,
        tokens: { entree: 1200, sortie: 340 },
      })),
    )
    expect(pilote.modeRaisonnement()).toBe('llm')

    await pilote.demarrer(BRIEF_SANTE)
    await jusqua(() => pilote.phase() === 'Décision')
    pilote.approuver()
    await jusqua(() => pilote.fini())

    // Un appel pour le plan, un par agent qui raisonne : le compteur suit
    // exactement ce qui a été demandé au modèle.
    const appels = appelsAuModele(pilote)
    expect(appels).toBeGreaterThan(2)
    expect(pilote.store.etat.value.tokens).toEqual({
      entree: appels * 1200,
      sortie: appels * 340,
    })

    const branches = pilote.store.etat.value.noeuds.filter((n) => n.branche === true)
    // Le maître est branché lui aussi : c'est le modèle qui a proposé le plan.
    expect(branches.map((n) => n.nom)).toContain('agent-maitre')
    expect(branches.length).toBe(appels)
    await pilote.arreter()
  })

  it('poursuit le run et le dit quand le modèle échoue', async () => {
    const pilote = creerPilote()
    pilote.brancher(
      modele(async (demande) => ({
        texte: demande.repli,
        origine: 'llm' as const,
        echec: 'quota dépassé',
      })),
    )

    await pilote.demarrer(BRIEF_SANTE)
    await jusqua(() => pilote.phase() === 'Décision')
    pilote.approuver()
    await jusqua(() => pilote.fini())

    // Le run va au bout : un modèle indisponible ne casse pas la démonstration.
    expect(pilote.phase()).toBe('Terminé')
    const enRepli = pilote.store.etat.value.noeuds.filter((n) => n.repli !== undefined)
    expect(enRepli.length).toBeGreaterThan(0)
    expect(enRepli[0]?.artefact?.corps ?? enRepli[0]?.repli).toContain('quota dépassé')
    // Aucun token n'a été dépensé : le compteur ne fait pas semblant.
    expect(pilote.store.etat.value.tokens).toEqual({ entree: 0, sortie: 0 })
    await pilote.arreter()
  })

  it('revient au déterministe quand on débranche', () => {
    const pilote = creerPilote()
    pilote.brancher(MODELE_MUET)
    pilote.brancher(undefined)
    expect(pilote.modeRaisonnement()).toBe('deterministe')
  })
})

describe('la voie de fabrication', () => {
  it('reste la composition tant que rien n a été consenti', () => {
    const pilote = creerPilote()
    expect(pilote.voieDeFabrication()).toBe('composition')

    pilote.brancher(MODELE_MUET)
    // Brancher un modèle n'autorise pas à évaluer du code : c'est un
    // arbitrage séparé.
    expect(pilote.voieDeFabrication()).toBe('composition')
  })

  it("passe à l'évaluation seulement branchée et consentie", () => {
    const pilote = creerPilote()
    pilote.brancher(MODELE_MUET, { evaluation: true })
    expect(pilote.voieDeFabrication()).toBe('evaluation')
  })

  it("refuse l'évaluation sans modèle branché", () => {
    const pilote = creerPilote()
    pilote.brancher(undefined, { evaluation: true })
    expect(pilote.voieDeFabrication()).toBe('composition')
  })

  it('referme la voie par évaluation quand on débranche', () => {
    const pilote = creerPilote()
    pilote.brancher(MODELE_MUET, { evaluation: true })
    pilote.brancher(undefined)
    expect(pilote.voieDeFabrication()).toBe('composition')
  })

  it('fabrique réellement par évaluation quand la voie est ouverte', async () => {
    const pilote = creerPilote()
    pilote.brancher(MODELE_MUET, { evaluation: true })
    await pilote.demarrer(BRIEF_SANTE)
    await jusqua(() => pilote.phase() === 'Décision')
    pilote.approuver()
    await jusqua(() => pilote.verificateur() !== undefined)

    const piece = pilote.store.etat.value.noeuds.find((n) => n.fabrication !== undefined)
    expect(piece?.fabrication?.voie).toBe('evaluation')
    // Et la pièce évaluée marche : elle classe pour de vrai.
    expect(pilote.verificateur()?.('Ce produit guérit les carences.')[0]?.statut).toBe('interdit')
    await pilote.arreter()
  })
})

describe('la robustesse du branchement', () => {
  it('ne fige pas le run quand le port rejette', async () => {
    const pilote = creerPilote()
    pilote.brancher(
      modele(async () => {
        throw new Error('boum')
      }),
    )

    await pilote.demarrer(BRIEF_SANTE)
    await jusqua(() => pilote.phase() === 'Décision')
    pilote.approuver()
    await jusqua(() => pilote.fini())

    // Un port qui lève ne doit pas laisser tout l'aval en attente
    // indéfiniment, avec un graphe qui n'affiche rien d'anormal.
    expect(pilote.phase()).toBe('Terminé')
    const enRepli = pilote.store.etat.value.noeuds.filter((n) => n.repli !== undefined)
    expect(enRepli.length).toBeGreaterThan(0)
    expect(enRepli.map((n) => n.repli).join(' ')).toContain('boum')
    expect(enRepli.every((n) => n.etat === 'termine')).toBe(true)
    await pilote.arreter()
  })

  it('dit dans la mémoire de run quel mode a réellement servi', async () => {
    const pilote = creerPilote()
    pilote.brancher(MODELE_MUET)
    await pilote.demarrer(BRIEF_SANTE)
    await jusqua(() => pilote.plan() !== undefined)

    const memoire = pilote.noyau()?.produit<{ decisions: readonly string[] }>('memoire')
    expect((memoire?.decisions ?? []).join('\n')).toContain('Mode LLM branché')
    await pilote.arreter()
  })

  it('dit dans la mémoire de run quelle voie de fabrication a servi', async () => {
    const pilote = creerPilote()
    pilote.brancher(MODELE_MUET, { evaluation: true })
    await pilote.demarrer(BRIEF_SANTE)
    await jusqua(() => pilote.plan() !== undefined)

    const memoire = pilote.noyau()?.produit<{ decisions: readonly string[] }>('memoire')
    expect((memoire?.decisions ?? []).join('\n')).toContain('évaluation de code')
    await pilote.arreter()
  })

  it('dit quand le plan du modèle a été écarté, et lequel a servi', async () => {
    const pilote = creerPilote()
    pilote.brancher(
      modele(async () => ({ texte: 'je préfère en parler', origine: 'llm' as const })),
    )
    await pilote.demarrer(BRIEF_SANTE)
    await jusqua(() => pilote.plan() !== undefined)

    expect(pilote.plan()?.origine).toBe('deterministe')
    const maitre = pilote.store.etat.value.noeuds.find((n) => n.nom === 'agent-maitre')
    expect(maitre?.artefact?.corps).toContain('Modèle écarté')
    await pilote.arreter()
  })
})
