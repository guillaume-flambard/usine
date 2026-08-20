// Le modèle de lecture : ce que l'interface affiche, et rien d'autre.
// Produit exclusivement par le réducteur, jamais écrit ailleurs.

import type {
  Artefact,
  CauseDesactivation,
  ErreurComposant,
  Fabrication,
  IdComposant,
  Presentation,
} from '../runtime/contrat'

/**
 * Les six états qu'un nœud peut montrer. Le moteur n'en connaît que quatre :
 * `termine` et `en-attente-de-dependance` sont des lectures, pas des états
 * de cycle de vie.
 */
export type EtatAffiche =
  'inactif' | 'en-attente-de-dependance' | 'en-cours' | 'termine' | 'en-erreur' | 'libere'

export interface NoeudVue {
  id: IdComposant
  nom: string
  presentation: Presentation
  injecte: readonly string[]
  fournit: readonly string[]
  etat: EtatAffiche
  /** Pourquoi il s'est désactivé la dernière fois, s'il l'a été. */
  cause?: CauseDesactivation
  /** L'erreur qui l'a mis en défaut, s'il y en a une. */
  erreur?: ErreurComposant
  /** Ce que ce composant a écrit, dans sa dernière version. */
  artefact?: Artefact
  /** Renseigné quand la pièce a été fabriquée pendant le run. */
  fabrication?: Fabrication
  /** Le composant qui l'a fabriquée. */
  fabriquePar?: IdComposant
  /** Séquence de son apparition — c'est l'ordre de révélation. */
  apparuA: number
}

export interface AreteVue {
  de: IdComposant
  vers: IdComposant
  nom: string
  /** Vrai dès qu'une valeur y a réellement transité. */
  aTransite: boolean
  /** Séquence du dernier transit, pour animer la plus récente. */
  dernierTransit?: number
}

export interface MessageJournal {
  sequence: number
  id: IdComposant
  auteur: string
  message: string
}

export interface IncidentJournal {
  sequence: number
  erreur: ErreurComposant
}

export interface EtatRun {
  noeuds: readonly NoeudVue[]
  aretes: readonly AreteVue[]
  /** Le message de plus haute séquence. Une seule ligne à l'écran. */
  narration?: MessageJournal
  journal: readonly MessageJournal[]
  incidents: readonly IncidentJournal[]
  /** Nombre de nœuds ni libérés ni en erreur. */
  agentsVivants: number
  /** Dernière séquence réduite. Sert à repérer un flux qui saute. */
  derniereSequence: number
}
