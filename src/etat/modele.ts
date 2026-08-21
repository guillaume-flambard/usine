// Le modèle de lecture : ce que l'interface affiche, et rien d'autre.
// Produit exclusivement par le réducteur, jamais écrit ailleurs.

import type {
  Artefact,
  CauseDesactivation,
  Decision,
  ObjetDeDecision,
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
  /** Vrai quand ce composant a réellement appelé un modèle. */
  branche?: boolean
  /** Ce qui l'a fait retomber sur son repli déterministe. */
  repli?: string
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

/**
 * Un échange entre deux agents. C'est le seul aller-retour du système : les
 * coeffects, eux, ne vont que dans un sens.
 */
export interface EchangeVue {
  de: IdComposant
  vers: IdComposant
  question: string
  /** Absente tant que le destinataire n'a pas répondu, ou s'il est resté muet. */
  reponse?: string
  sequence: number
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

/** La porte humaine, telle que l'interface doit la montrer. */
export interface PorteVue {
  id: IdComposant
  objet: ObjetDeDecision
  /** `undefined` tant que personne n'a tranché. */
  decision?: Decision
  /** Séquence à laquelle la porte s'est ouverte. */
  ouverteA: number
  /** Séquence à laquelle elle a été tranchée. */
  decideeA?: number
}

export interface EtatRun {
  noeuds: readonly NoeudVue[]
  aretes: readonly AreteVue[]
  /** Les questions posées d'agent à agent, et leurs réponses. */
  echanges: readonly EchangeVue[]
  /** Le message de plus haute séquence. Une seule ligne à l'écran. */
  narration?: MessageJournal
  journal: readonly MessageJournal[]
  incidents: readonly IncidentJournal[]
  /** Présente dès que le run atteint la porte, et conservée après la décision. */
  porte?: PorteVue
  /** Tokens réellement consommés. Reste à zéro en mode déterministe. */
  tokens: { entree: number; sortie: number }
  /** Nombre de nœuds ni libérés ni en erreur. */
  agentsVivants: number
  /** Dernière séquence réduite. Sert à repérer un flux qui saute. */
  derniereSequence: number
}
