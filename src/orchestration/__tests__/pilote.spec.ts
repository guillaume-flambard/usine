// Le câblage réel de l'application — noyau, store, disposition, brief — testé
// hors composant. Sans ça, on peut casser l'application entière au niveau du
// branchement avec une suite entièrement verte.
import { describe, expect, it } from 'vitest'
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
