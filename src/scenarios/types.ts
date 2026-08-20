// Un scénario est une donnée. Il déclare ; il n'exécute rien, n'importe ni
// l'interface ni le noyau, et ajouter un scénario ne touche aucun fichier
// du moteur.

import type { Composant } from '../runtime/contrat'

/** Une entrée du casting : le composant, et la clé qui fixe son rang. */
export interface EntreeCasting {
  /**
   * Clé de déclaration. Elle ordonne les nœuds à l'intérieur d'une couche,
   * pour que deux runs de même topologie se disposent pareil quel que soit
   * l'ordre d'activation.
   */
  cle: string
  composant: Composant
}

/** Un nom de dépendance, et le composant qui a le droit de le publier. */
export interface NomReserve {
  nom: string
  /** La clé de déclaration du propriétaire. */
  proprietaire: string
}

export interface Scenario {
  /** Identifiant court, sert à la sélection. */
  cle: string
  /** Le nom du produit visé, tel qu'il s'affiche. */
  titre: string
  /** Le besoin métier pré-rempli dans le champ de brief. */
  brief: string
  /** L'agent qui ouvre le run. Les autres sont chargés par lui. */
  maitre: EntreeCasting
  /** Tout ce que le run met en scène, agents et outils confondus. */
  casting: readonly EntreeCasting[]
  /** Qui publie quoi. Un nom sans propriétaire déclaré est une erreur de scénario. */
  nomsReserves: readonly NomReserve[]
  /**
   * Les places tenues d'avance pour les composants fabriqués à l'exécution.
   * La disposition est calculée une fois sur la topologie complète : sans
   * ces places, l'arrivée d'une pièce fabriquée ferait sauter les nœuds
   * déjà posés.
   */
  emplacementsReserves: readonly EntreeCasting[]
}
