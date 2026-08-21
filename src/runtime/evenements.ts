// Le canal unique. Tout ce que le reste de l'application apprend d'un run
// passe par ici. Ajouter une information visible, c'est ajouter une variante.

import type {
  Artefact,
  CauseDesactivation,
  Decision,
  ObjetDeDecision,
  ErreurComposant,
  Fabrication,
  IdComposant,
  Presentation,
} from './contrat'

interface Base {
  /** Strictement croissant, sans trou, attribué par le noyau. */
  sequence: number
}

export interface ComposantCree extends Base {
  type: 'composant-cree'
  id: IdComposant
  nom: string
  /** Qui l'a fait exister. Absent pour ce que l'orchestration charge. */
  parent?: IdComposant
  presentation: Presentation
  injecte: readonly string[]
  fournit: readonly string[]
}

export interface ComposantActive extends Base {
  type: 'composant-active'
  id: IdComposant
}

export interface ComposantDesactive extends Base {
  type: 'composant-desactive'
  id: IdComposant
  cause: CauseDesactivation
}

export interface ComposantLibere extends Base {
  type: 'composant-libere'
  id: IdComposant
}

export interface ComposantEnErreur extends Base {
  type: 'composant-en-erreur'
  erreur: ErreurComposant
}

export interface MessageEmis extends Base {
  type: 'message-emis'
  id: IdComposant
  message: string
}

export interface TravailTermine extends Base {
  type: 'travail-termine'
  id: IdComposant
}

export interface ValeurTransmise extends Base {
  type: 'valeur-transmise'
  de: IdComposant
  vers: IdComposant
  nom: string
}

export interface ArtefactProduit extends Base {
  type: 'artefact-produit'
  id: IdComposant
  artefact: Artefact
}

export interface ComposantFabrique extends Base {
  type: 'composant-fabrique'
  id: IdComposant
  /** Le composant qui l'a fabriqué. */
  parent: IdComposant
  fabrication: Fabrication
}

export interface PorteAtteinte extends Base {
  type: 'porte-atteinte'
  id: IdComposant
  objet: ObjetDeDecision
}

export interface TokensConsommes extends Base {
  type: 'tokens-consommes'
  id: IdComposant
  entree: number
  sortie: number
  /** Ce qui a fait retomber l'agent sur son repli déterministe, le cas échéant. */
  echec?: string
}

export interface PorteRetiree extends Base {
  type: 'porte-retiree'
  id: IdComposant
}

export interface DecisionPrise extends Base {
  type: 'decision-prise'
  id: IdComposant
  decision: Decision
}

/** Une question adressée d'un composant à un autre. */
export interface QuestionPosee extends Base {
  type: 'question-posee'
  de: IdComposant
  vers: IdComposant
  question: string
}

/** La réponse à une question. `de` est celui qui répond. */
export interface ReponseDonnee extends Base {
  type: 'reponse-donnee'
  de: IdComposant
  vers: IdComposant
  reponse: string
}

/** Émis quand un abonné lève : le run continue, l'incident est visible. */
export interface AbonneEnErreur extends Base {
  type: 'abonne-en-erreur'
  message: string
}

export type EvenementRun =
  | ComposantCree
  | ComposantActive
  | ComposantDesactive
  | ComposantLibere
  | ComposantEnErreur
  | MessageEmis
  | TravailTermine
  | ValeurTransmise
  | ArtefactProduit
  | ComposantFabrique
  | TokensConsommes
  | QuestionPosee
  | ReponseDonnee
  | PorteAtteinte
  | PorteRetiree
  | DecisionPrise
  | AbonneEnErreur

export type Abonne = (evenement: EvenementRun) => void

/**
 * Un événement avant que le noyau lui attribue sa séquence.
 * Distributif : sans ça, `Omit` s'appliquerait à l'union entière et
 * ne garderait que les clés communes — les variantes cesseraient
 * d'être vérifiées.
 */
export type SansSequence<T = EvenementRun> = T extends EvenementRun ? Omit<T, 'sequence'> : never
