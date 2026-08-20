// Le canal unique. Tout ce que le reste de l'application apprend d'un run
// passe par ici. Ajouter une information visible, c'est ajouter une variante.

import type {
  Artefact,
  CauseDesactivation,
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
  | AbonneEnErreur

export type Abonne = (evenement: EvenementRun) => void

/**
 * Un événement avant que le noyau lui attribue sa séquence.
 * Distributif : sans ça, `Omit` s'appliquerait à l'union entière et
 * ne garderait que les clés communes — les variantes cesseraient
 * d'être vérifiées.
 */
export type SansSequence<T = EvenementRun> = T extends EvenementRun ? Omit<T, 'sequence'> : never
