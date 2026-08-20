// Le pilote : tout ce qui fait vivre un run — le noyau, le store, la
// disposition, l'horloge — hors de tout composant Vue. C'est ce qui rend le
// câblage de l'application vérifiable sans navigateur.

import { disposer, type Disposition } from '../etat/disposition'
import { creerStore, type StoreRun } from '../etat/store'
import { creerNoyau, type Noyau } from '../runtime/noyau'
import type { Scenario } from '../scenarios/types'
import { lancer, ordreDuScenario, topologieDeclaree } from './lancer'

/** La disposition d'un scénario : calculée une fois, sur la topologie déclarée. */
export const disposerScenario = (scenario: Scenario): Disposition =>
  disposer(topologieDeclaree(scenario), { ordre: ordreDuScenario(scenario) })

export type PhaseRun =
  'Au repos' | 'Analyse' | 'Construction' | 'Décision' | 'Terminé' | 'Incident' | 'Libéré'

export interface Pilote {
  readonly store: StoreRun
  disposition(): Disposition
  scenario(): Scenario
  phase(): PhaseRun
  /** Vrai quand plus rien ne bougera sans une action humaine. */
  fini(): boolean
  erreur(): string | undefined
  demarrer(brief: string): Promise<void>
  arreter(): Promise<void>
  changerScenario(scenario: Scenario): Promise<void>
  /** Approuve la porte en attente. Rend `false` si aucune n'attend. */
  approuver(): boolean
  /**
   * Écarte la porte en attente : la livraison n'aura pas lieu, et la pièce
   * fabriquée est libérée pour que le graphe montre la rétractation.
   */
  ecarter(): Promise<boolean>
  /** Le noyau du run en cours, pour l'introspection. Absent au repos. */
  noyau(): Noyau | undefined
}

export function creerPilote(scenarioInitial: Scenario): Pilote {
  const store = creerStore()
  let scenarioCourant = scenarioInitial
  let dispositionCourante = disposerScenario(scenarioInitial)
  let noyauCourant: Noyau | undefined
  let debrancher: (() => void) | undefined
  let derniereErreur: string | undefined
  let demarrageEnCours = false

  const phase = (): PhaseRun => {
    const noeuds = store.etat.value.noeuds
    if (noeuds.length === 0) return 'Au repos'
    if (noeuds.every((n) => n.etat === 'libere')) return 'Libéré'
    if (noeuds.some((n) => n.etat === 'en-erreur')) return 'Incident'
    const porte = store.etat.value.porte
    // Une porte en attente arrête le run : ce n'est ni une fin ni une panne.
    if (porte !== undefined && porte.decision === undefined) return 'Décision'
    if (noeuds.every((n) => n.etat === 'termine')) return 'Terminé'
    if (noeuds.some((n) => n.nom.startsWith('constructeur-') && n.etat === 'en-cours'))
      return 'Construction'
    return 'Analyse'
  }

  async function arreter() {
    debrancher?.()
    debrancher = undefined
    await noyauCourant?.libererTout()
    noyauCourant = undefined
  }

  return {
    store,
    disposition: () => dispositionCourante,
    scenario: () => scenarioCourant,
    phase,
    fini: () => ['Terminé', 'Libéré', 'Incident'].includes(phase()),
    erreur: () => derniereErreur,
    noyau: () => noyauCourant,
    arreter,
    async demarrer(brief: string) {
      // Deux démarrages entrelacés partageraient le même noyau.
      if (demarrageEnCours) return
      demarrageEnCours = true
      try {
        await arreter()
        store.reinitialiser()
        derniereErreur = undefined
        noyauCourant = creerNoyau()
        debrancher = store.brancher(noyauCourant)
        await lancer(noyauCourant, scenarioCourant, { brief })
      } catch (cause) {
        derniereErreur = cause instanceof Error ? cause.message : String(cause)
        await arreter()
      } finally {
        demarrageEnCours = false
      }
    },
    approuver() {
      const porte = store.etat.value.porte
      if (porte === undefined || porte.decision !== undefined) return false
      return noyauCourant?.decider(porte.id, 'approuve') ?? false
    },
    async ecarter() {
      const porte = store.etat.value.porte
      if (porte === undefined || porte.decision !== undefined) return false
      const tranchee = noyauCourant?.decider(porte.id, 'ecarte') ?? false
      if (!tranchee) return false
      // Écarter doit se voir : les pièces fabriquées sont libérées, et le
      // graphe montre la rétractation au lieu de se figer.
      for (const noeud of store.etat.value.noeuds) {
        if (noeud.fabrication !== undefined && noeud.etat !== 'libere') {
          await noyauCourant?.liberer(noeud.id)
        }
      }
      return true
    },
    async changerScenario(scenario: Scenario) {
      await arreter()
      scenarioCourant = scenario
      dispositionCourante = disposerScenario(scenario)
      store.reinitialiser()
      derniereErreur = undefined
    },
  }
}
