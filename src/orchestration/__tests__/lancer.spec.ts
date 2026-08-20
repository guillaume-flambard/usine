import { describe, expect, it } from 'vitest'
import { lancer, ordreDeclare, topologieDeclaree, verifierScenario } from '../lancer'
import { claimCheck } from '../../scenarios/claim-check'
import { creerNoyau } from '../../runtime/noyau'
import { creerStore } from '../../etat/store'
import type { Scenario } from '../../scenarios/types'

// Le casting déclaré, plus l'agent maître, plus la pièce que le
// constructeur produit fabrique pendant le run.
const NOEUDS_ATTENDUS = claimCheck.casting.length + 2

const tick = async () => {
  for (let index = 0; index < 5; index += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

describe('cohérence du scénario', () => {
  it('accepte le scénario livré', () => {
    expect(verifierScenario(claimCheck)).toEqual([])
  })

  it('refuse un nom réservé à quelqu un qui ne le déclare pas', () => {
    const casse: Scenario = {
      ...claimCheck,
      nomsReserves: [...claimCheck.nomsReserves, { nom: 'fantome', proprietaire: 'a-maitre' }],
    }
    expect(verifierScenario(casse).map((d) => d.code)).toContain('nom-non-declare')
  })

  it('refuse un propriétaire absent du casting', () => {
    const casse: Scenario = {
      ...claimCheck,
      nomsReserves: [...claimCheck.nomsReserves, { nom: 'fantome', proprietaire: 'z-inconnu' }],
    }
    expect(verifierScenario(casse).map((d) => d.code)).toContain('proprietaire-inconnu')
  })

  it('refuse un composant qui publie sans être déclaré propriétaire', () => {
    const casse: Scenario = {
      ...claimCheck,
      nomsReserves: claimCheck.nomsReserves.filter((r) => r.nom !== 'registre'),
    }
    expect(verifierScenario(casse).map((d) => d.code)).toContain('nom-sans-proprietaire')
  })

  it('refuse deux clés de déclaration identiques', () => {
    const premiere = claimCheck.casting[0]
    expect(premiere).toBeDefined()
    const casse: Scenario = {
      ...claimCheck,
      casting: [...claimCheck.casting, premiere!],
    }
    expect(verifierScenario(casse).map((d) => d.code)).toContain('cle-en-double')
  })

  it("refuse de lancer un scénario incohérent plutôt que d'aller au mur", async () => {
    const casse: Scenario = {
      ...claimCheck,
      nomsReserves: [...claimCheck.nomsReserves, { nom: 'fantome', proprietaire: 'z-inconnu' }],
    }
    await expect(lancer(creerNoyau(), casse)).rejects.toThrow(/incohérent/)
  })
})

describe('ordre de déclaration', () => {
  it("ordonne par clé, jamais par ordre d'arrivée", () => {
    const melange = [...claimCheck.casting].reverse()
    expect(ordreDeclare(melange).map((e) => e.cle)).toEqual(claimCheck.casting.map((e) => e.cle))
  })

  it('rend la topologie complète, emplacements réservés compris', () => {
    const noms = topologieDeclaree(claimCheck).map((c) => c.nom)
    expect(noms).toContain('agent-maitre')
    expect(noms).toContain('verificateur-allegations')
    expect(noms).toHaveLength(claimCheck.casting.length + 2)
  })
})

describe('un run complet du scénario livré', () => {
  it('met en scène le casting attendu et le mène à terme', async () => {
    const noyau = creerNoyau()
    const store = creerStore()
    store.brancher(noyau)

    await lancer(noyau, claimCheck)
    await tick()

    const etat = store.etat.value
    expect(etat.noeuds).toHaveLength(NOEUDS_ATTENDUS)

    // Le casting minimum exigé : planificateur, architecte, deux outils au
    // moins, trois constructeurs en parallèle, un sceptique, une livraison.
    // Trois constructeurs en parallèle, plus celui qui fabrique la pièce.
    const constructeurs = etat.noeuds.filter((n) => n.nom.startsWith('constructeur-'))
    expect(constructeurs.length).toBeGreaterThanOrEqual(3)
    expect(etat.noeuds.some((n) => n.nom === 'constructeur-produit')).toBe(true)
    expect(etat.noeuds.some((n) => n.nom === 'planificateur')).toBe(true)
    expect(etat.noeuds.some((n) => n.nom === 'architecte')).toBe(true)
    expect(etat.noeuds.some((n) => n.nom === 'sceptique')).toBe(true)
    expect(etat.noeuds.some((n) => n.nom === 'livraison')).toBe(true)

    // Tout le monde a terminé : la chaîne s'est propagée de bout en bout.
    expect(etat.noeuds.every((n) => n.etat === 'termine')).toBe(true)
    // La pièce fabriquée pendant le run est là, à la place qui lui était tenue.
    expect(etat.noeuds.some((n) => n.nom === 'verificateur-allegations')).toBe(true)
    expect(etat.agentsVivants).toBe(NOEUDS_ATTENDUS)
  })

  it("n'affiche une technologie que sur les nœuds qui en exécutent une", async () => {
    const noyau = creerNoyau()
    const store = creerStore()
    store.brancher(noyau)
    await lancer(noyau, claimCheck)
    await tick()

    const avecTechno = store.etat.value.noeuds.filter(
      (n) => n.presentation.technologie !== undefined,
    )
    expect(avecTechno.map((n) => n.nom).sort()).toEqual([
      'constructeur-interface',
      'outil-registre',
    ])
  })

  it('construit des arêtes réelles qui ont toutes transité', async () => {
    const noyau = creerNoyau()
    const store = creerStore()
    store.brancher(noyau)
    await lancer(noyau, claimCheck)
    await tick()

    const aretes = store.etat.value.aretes
    expect(aretes.length).toBeGreaterThanOrEqual(10)
    // Chaque arête correspond à une lecture réelle : aucune n'est décorative.
    expect(aretes.every((a) => a.aTransite)).toBe(true)
  })

  it("libère tout le run quand on libère l'agent maître", async () => {
    const noyau = creerNoyau()
    const { maitre } = await lancer(noyau, claimCheck)
    await tick()
    expect(noyau.introspecter().composants).toHaveLength(NOEUDS_ATTENDUS)

    // Libérer le seul agent maître suffit : tout le reste tombe en cascade.
    await noyau.liberer(maitre)
    await tick()
    expect(noyau.introspecter().composants).toHaveLength(0)
  })
})

describe('la discipline des dépendances', () => {
  it("n'a aucune dépendance déclarée qui ne soit jamais lue", async () => {
    const noyau = creerNoyau()
    const store = creerStore()
    store.brancher(noyau)
    await lancer(noyau, claimCheck)
    await tick()

    // Une dépendance déclarée mais jamais consommée est une arête qui
    // s'affiche sans jamais rien porter : le graphe mentirait par omission.
    const muettes = store.etat.value.aretes.filter((a) => !a.aTransite)
    expect(muettes.map((a) => `${a.de} --${a.nom}--> ${a.vers}`)).toEqual([])
  })
})
