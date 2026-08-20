// Le pilote : tout ce qui fait vivre un run — le noyau, le store, la
// disposition, l'horloge — hors de tout composant Vue. C'est ce qui rend le
// câblage de l'application vérifiable sans navigateur.

import { disposer, type Disposition } from '../etat/disposition'
import { creerStore, type StoreRun } from '../etat/store'
import { creerNoyau, type Noyau } from '../runtime/noyau'
import type { Verdict } from '../runtime/fabrique/primitives'
import type { Scenario } from '../scenarios/types'
import { lancer, ordreDuScenario, topologieDeclaree } from './lancer'

/** La disposition d'un scénario : calculée une fois, sur la topologie déclarée. */
export const disposerScenario = (scenario: Scenario): Disposition =>
  disposer(topologieDeclaree(scenario), { ordre: ordreDuScenario(scenario) })

export type PhaseRun =
  | 'Au repos'
  | 'Analyse'
  | 'Construction'
  | 'Décision'
  | 'Écarté'
  | 'Terminé'
  | 'Incident'
  | 'Libéré'

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
  /**
   * Le produit livré, quand le run est allé jusqu'au bout. C'est la
   * fonction que la pièce fabriquée publie — l'application la consomme,
   * elle ne participe pas à la composition.
   */
  verificateur(): ((texte: string) => readonly Verdict[]) | undefined
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
    const porte = store.etat.value.porte
    // Une porte en attente arrête le run : ce n'est ni une fin ni une panne.
    if (porte !== undefined && porte.decision === undefined) return 'Décision'
    // Un run écarté est arrêté, pas en cours : le dire « Analyse » laisserait
    // croire qu'il travaille encore.
    if (porte?.decision === 'ecarte') return 'Écarté'
    // L'incident vient après la porte : tant qu'on attend une décision, dire
    // « Incident » et déclarer le run fini laisserait des boutons actifs sur
    // un run annoncé terminé.
    if (noeuds.some((n) => n.etat === 'en-erreur')) return 'Incident'
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
    fini: () => ['Terminé', 'Écarté', 'Libéré', 'Incident'].includes(phase()),
    erreur: () => derniereErreur,
    noyau: () => noyauCourant,
    verificateur() {
      // Seulement après une approbation : le produit n'est livré qu'une fois
      // la porte franchie, et écarter le retire.
      if (store.etat.value.porte?.decision !== 'approuve') return undefined
      // Ni depuis un run tombé en panne ou libéré : servir le produit d'un
      // run que le graphe montre en échec serait incohérent.
      if (phase() === 'Incident' || phase() === 'Libéré') return undefined
      const publie = noyauCourant?.produit<unknown>('verificateur')
      // `produit` rend ce qui a été publié sous ce nom, quel qu'il soit :
      // sans cette garde, un clic finirait en TypeError dans la page.
      return typeof publie === 'function'
        ? (publie as (texte: string) => readonly Verdict[])
        : undefined
    },
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
      // Le noyau est capturé : si l'utilisateur relance pendant la
      // rétractation, les identifiants restants viseraient le nouveau run.
      const noyau = noyauCourant
      if (noyau === undefined) return false
      if (!noyau.decider(porte.id, 'ecarte')) return false
      // Écarter doit se voir : les pièces fabriquées sont libérées, et le
      // graphe montre la rétractation au lieu de se figer.
      for (const noeud of store.etat.value.noeuds) {
        if (noyauCourant !== noyau) return true
        if (noeud.fabrication === undefined || noeud.etat === 'libere') continue
        try {
          await noyau.liberer(noeud.id)
        } catch {
          // Une libération qui échoue n'interrompt pas la rétractation des
          // autres pièces.
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
