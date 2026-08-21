// Le câblage réel de l'application — noyau, store, disposition, besoin —
// testé hors composant. Sans ça, on peut casser l'application entière au
// niveau du branchement avec une suite entièrement verte.
import { describe, expect, it, vi } from 'vitest'
import { creerPilote } from '../pilote'
import type { Raisonneur } from '../../runtime/raisonneur'
import { modeleScripte } from '../../agents/__tests__/modele-scripte'
import { BRIEF, jusqua, piloteScripte, runJusquALaPorte, runTermine } from './aide'

const modele = (raisonner: Raisonneur['raisonner']): Raisonneur => ({ origine: 'llm', raisonner })

describe('pilote', () => {
  it('mène un run complet et remplit la vue', async () => {
    const pilote = piloteScripte()
    expect(pilote.phase()).toBe('Au repos')

    await pilote.demarrer(BRIEF)
    await jusqua(() => pilote.phase() === 'Décision')

    // Le run s'arrête tout seul sur la porte humaine : rien ne la franchit.
    expect(pilote.phase()).toBe('Décision')
    expect(pilote.fini()).toBe(false)
    expect(pilote.approuver()).toBe(true)
    await jusqua(() => pilote.fini())

    expect(pilote.store.etat.value.noeuds.length).toBeGreaterThan(3)
    expect(pilote.store.etat.value.narration).toBeDefined()
    expect(pilote.erreur()).toBeUndefined()
    await pilote.arreter()
  })

  it('fait réellement piloter le run par le besoin saisi', async () => {
    const vu: string[] = []
    const pilote = creerPilote({ pasMs: 10, delaiStabilisationMs: 1000 })
    pilote.brancher(
      modele(async (demande) => {
        vu.push(demande.contexte)
        return {
          texte: '{"pensee":"","actions":[{"type":"terminer","resume":""}]}',
          origine: 'llm',
        }
      }),
    )
    await pilote.demarrer('Un compteur de syllabes pour poètes pressés.')
    await jusqua(() => vu.length > 0)

    // Le champ serait décoratif si le modèle ne le recevait pas.
    expect(vu.join('\n')).toContain('syllabes')
    await pilote.arreter()
  })

  it('remet tout à zéro entre deux runs', async () => {
    const pilote = await runJusquALaPorte()
    const premier = pilote.store.etat.value.derniereSequence

    await pilote.demarrer(BRIEF)
    await jusqua(() => pilote.store.etat.value.noeuds.length > 1)

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

  it('a une place pour chaque nœud, y compris ceux nés en cours de route', async () => {
    const pilote = await runTermine()
    for (const noeud of pilote.store.etat.value.noeuds) {
      expect(pilote.disposition.value.boites.has(noeud.nom), noeud.nom).toBe(true)
    }
    await pilote.arreter()
  })

  it('donne un libellé court à chaque nœud, même inventé', async () => {
    // Sans libellé, le nom technique déborde d'un cadre de 140 px.
    const pilote = await runTermine()
    const sansLibelle = pilote.store.etat.value.noeuds.filter(
      (noeud) => noeud.presentation.libelle === undefined,
    )
    expect(sansLibelle.map((n) => n.nom)).toEqual([])
    await pilote.arreter()
  })
})

describe('le mode de raisonnement', () => {
  it('est déterministe par défaut, et rien ne part sur le réseau', async () => {
    const fetchEspion = vi.spyOn(globalThis, 'fetch')
    const pilote = creerPilote({ pasMs: 10, delaiStabilisationMs: 500 })
    expect(pilote.modeRaisonnement()).toBe('deterministe')

    await pilote.demarrer(BRIEF)
    await jusqua(() => pilote.store.etat.value.porte !== undefined)

    expect(fetchEspion).not.toHaveBeenCalled()
    expect(pilote.store.etat.value.tokens).toEqual({ entree: 0, sortie: 0 })
    fetchEspion.mockRestore()
    await pilote.arreter()
  })

  it("ne fait naître aucun agent sans modèle, et l'écrit dans la porte", async () => {
    const pilote = creerPilote({ pasMs: 10, delaiStabilisationMs: 500 })
    await pilote.demarrer(BRIEF)
    await jusqua(() => pilote.store.etat.value.porte !== undefined)

    // Une usine qui invente sans modèle serait un catalogue déguisé.
    expect(pilote.store.etat.value.noeuds).toHaveLength(1)
    expect(pilote.store.etat.value.porte?.objet.resume).toContain("Aucun agent n'a été créé")
    await pilote.arreter()
  })

  it('compte les tokens réellement dépensés, et marque les agents branchés', async () => {
    const pilote = await runJusquALaPorte()

    const { entree, sortie } = pilote.store.etat.value.tokens
    expect(entree).toBeGreaterThan(0)
    expect(sortie).toBeGreaterThan(0)
    const branches = pilote.store.etat.value.noeuds.filter((n) => n.branche === true)
    expect(branches.map((n) => n.nom)).toContain('agent-maitre')
    await pilote.arreter()
  })

  it('poursuit le run et le dit quand le modèle échoue', async () => {
    const pilote = creerPilote({ pasMs: 10, delaiStabilisationMs: 800 })
    pilote.brancher(
      modele(async () => ({ texte: '', origine: 'llm' as const, echec: 'quota dépassé' })),
    )

    await pilote.demarrer(BRIEF)
    await jusqua(() => pilote.store.etat.value.porte !== undefined)

    // Un modèle indisponible n'empêche pas d'atteindre la porte : le run va
    // au bout et dit qu'il n'a rien produit.
    expect(pilote.store.etat.value.porte).toBeDefined()
    const maitre = pilote.store.etat.value.noeuds.find((n) => n.nom === 'agent-maitre')
    expect(maitre?.repli).toContain('quota dépassé')
    await pilote.arreter()
  })

  it('ne fige pas le run quand le port rejette', async () => {
    const pilote = creerPilote({ pasMs: 10, delaiStabilisationMs: 800 })
    pilote.brancher(
      modele(async () => {
        throw new Error('boum')
      }),
    )

    await pilote.demarrer(BRIEF)
    await jusqua(() => pilote.store.etat.value.porte !== undefined)

    expect(pilote.store.etat.value.porte).toBeDefined()
    const maitre = pilote.store.etat.value.noeuds.find((n) => n.nom === 'agent-maitre')
    expect(maitre?.repli).toContain('boum')
    await pilote.arreter()
  })

  it('revient au déterministe quand on débranche', () => {
    const pilote = creerPilote()
    pilote.brancher(modeleScripte())
    expect(pilote.modeRaisonnement()).toBe('llm')
    pilote.brancher(undefined)
    expect(pilote.modeRaisonnement()).toBe('deterministe')
  })
})
