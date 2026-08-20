// Story 6.1 — la retargetabilité. Ce qui compte n'est pas qu'un second
// scénario existe : c'est qu'il n'ait demandé aucune modification du moteur.
import { describe, expect, it } from 'vitest'
import { creerPilote } from '../pilote'
import { verifierScenario } from '../lancer'
import { SCENARIOS, trouverScenario } from '../../scenarios'
import { pubCheck } from '../../scenarios/pub-check'
import { claimCheck } from '../../scenarios/claim-check'

const tick = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise<void>((r) => setTimeout(r, 0))
}

async function runComplet(scenario: typeof pubCheck) {
  const pilote = creerPilote(scenario)
  await pilote.demarrer(scenario.brief)
  await tick()
  pilote.approuver()
  await tick()
  return pilote
}

describe('le second scénario', () => {
  it('est cohérent et sélectionnable', () => {
    expect(verifierScenario(pubCheck)).toEqual([])
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(2)
    expect(trouverScenario('pub-check')).toBe(pubCheck)
  })

  it('emploie exactement le même casting que le premier', () => {
    // Le moteur ne connaît pas les scénarios : deux niches, une seule chaîne.
    expect(pubCheck.casting.map((e) => e.cle)).toEqual(claimCheck.casting.map((e) => e.cle))
    expect(pubCheck.casting.map((e) => e.composant.nom)).toEqual(
      claimCheck.casting.map((e) => e.composant.nom),
    )
  })

  it('mène un run complet et fabrique sa propre pièce', async () => {
    const pilote = await runComplet(pubCheck)

    expect(pilote.phase()).toBe('Terminé')
    const piece = pilote.store.etat.value.noeuds.find((n) => n.nom === 'verificateur-allegations')
    expect(piece?.fabrication).toBeDefined()
    expect(pilote.store.etat.value.incidents).toEqual([])
  })

  it('classe selon SA source de vérité, pas celle de l autre niche', async () => {
    const pilote = await runComplet(pubCheck)
    const verifier = pilote.verificateur()

    const trompeur = verifier?.('Notre offre est sans aucun risque.')[0]
    expect(trompeur?.statut).toBe('interdit')
    expect(trompeur?.source).toContain('Code de la consommation')

    // Une allégation santé n'a aucun sens ici : le registre publicitaire ne
    // la couvre pas, et l'outil ne prétend pas le contraire.
    const sante = verifier?.('Ce produit guérit les carences.')[0]
    expect(sante?.statut).toBe('a-verifier')
    expect(sante?.raison).toBe('aucune-regle')
  })

  it('affiche sa propre identité de source', async () => {
    const pilote = await runComplet(pubCheck)
    const registre = pilote.store.etat.value.noeuds.find((n) => n.nom === 'outil-registre')
    expect(registre?.presentation.technologie).toBe('Code conso.')
  })

  it('bascule proprement d une niche à l autre', async () => {
    const pilote = creerPilote(claimCheck)
    await pilote.demarrer(claimCheck.brief)
    await tick()

    await pilote.changerScenario(pubCheck)
    expect(pilote.scenario().cle).toBe('pub-check')
    expect(pilote.store.etat.value.noeuds).toHaveLength(0)
    expect(pilote.noyau()).toBeUndefined()
    // La disposition suit le scénario : chaque niche a sa propre topologie.
    expect(pilote.disposition().boites.has('verificateur-allegations')).toBe(true)
  })
})

const REGLES_PUBLICITAIRES = [
  { motif: 'prix le plus bas garanti', statut: 'interdit', source: 'L121-2' },
  { motif: 'sans aucun risque', statut: 'interdit', source: 'L121-2' },
  { motif: 'remboursé à 100 %', statut: 'interdit', source: 'L121-4' },
  { motif: 'garanti à vie', statut: 'interdit', source: 'L121-4' },
  { motif: 'résultats garantis', statut: 'interdit', source: 'L121-2' },
  { motif: 'leader incontesté', statut: 'a-verifier', source: 'L121-1' },
  { motif: 'numéro un', statut: 'a-verifier', source: 'L121-1' },
  { motif: 'le moins cher du marché', statut: 'a-verifier', source: 'L121-1' },
  { motif: 'meilleur prix', statut: 'a-verifier', source: 'L121-1' },
  { motif: 'prix conseillé par le fabricant', statut: 'autorise', source: 'L112-1' },
  { motif: 'offre valable jusqu’au', statut: 'autorise', source: 'L112-1' },
  { motif: 'dans la limite des stocks disponibles', statut: 'autorise', source: 'L121-4' },
] as const

describe('le registre publicitaire, règle par règle', () => {
  it('classe chaque motif comme il le déclare', async () => {
    const pilote = await runComplet(pubCheck)
    const verifier = pilote.verificateur()

    // Dix des douze règles n'étaient exercées par rien : une règle inerte ou
    // mal classée serait passée inaperçue.
    for (const { motif, statut, source } of REGLES_PUBLICITAIRES) {
      const verdict = verifier?.(`Notre offre ${motif}.`)[0]
      expect(verdict?.statut, motif).toBe(statut)
      if (statut !== 'a-verifier') expect(verdict?.source, motif).toContain(source)
    }
  })

  it('reconnaît la ponctuation française avec ou sans espace fine', async () => {
    const pilote = await runComplet(pubCheck)
    const verifier = pilote.verificateur()

    // La moitié des copies écrit « 100% » : l'exiger avec l'espace fine
    // rendrait la règle inerte sur la moitié des cas réels.
    for (const forme of ['remboursé à 100 %', 'remboursé à 100%', 'rembourse a 100%']) {
      expect(verifier?.(`Notre offre est ${forme}.`)[0]?.statut, forme).toBe('interdit')
    }
  })
})
