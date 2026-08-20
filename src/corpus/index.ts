// Les corpus dont l'usine dispose. Ce sont des données réglementaires
// réelles, pas des exemples : un plan choisit parmi elles, il n'en invente
// aucune. C'est la limite honnête de l'exercice — l'usine compose et
// fabrique librement, mais elle ne fabrique pas la loi.

import type { Regle } from '../outils/registre-eu'

export interface Corpus {
  /** Identifiant court, celui qu'un plan cite. */
  cle: string
  /** Le domaine, tel qu'il s'affiche. */
  titre: string
  /** Ce qui s'affiche sous le nœud de la source de vérité. */
  technologie: string
  /** Le rôle de la source, en une ligne. */
  role: string
  /** Les mots du brief qui désignent ce corpus. */
  indices: readonly string[]
  regles: readonly Regle[]
}

const ALLEGATIONS_SANTE: readonly Regle[] = [
  // Allégations de santé autorisées — Règlement (UE) 432/2012, annexe.
  {
    motif: 'contribue au fonctionnement normal du système immunitaire',
    statut: 'autorise',
    source: 'Règlement (UE) 432/2012, annexe',
  },
  {
    motif: 'contribue à réduire la fatigue',
    statut: 'autorise',
    source: 'Règlement (UE) 432/2012, annexe',
  },
  {
    motif: 'contribue au maintien d’une ossature normale',
    statut: 'autorise',
    source: 'Règlement (UE) 432/2012, annexe',
  },
  {
    motif: 'contribue à une fonction musculaire normale',
    statut: 'autorise',
    source: 'Règlement (UE) 432/2012, annexe',
  },
  {
    motif: 'contribue au maintien d’une vision normale',
    statut: 'autorise',
    source: 'Règlement (UE) 432/2012, annexe',
  },

  // Allégations thérapeutiques — interdites aux denrées alimentaires.
  { motif: 'guérit', statut: 'interdit', source: 'Règlement (CE) 1924/2006, art. 7' },
  { motif: 'soigne', statut: 'interdit', source: 'Règlement (CE) 1924/2006, art. 7' },
  { motif: 'traite', statut: 'interdit', source: 'Règlement (CE) 1924/2006, art. 7' },
  {
    motif: 'prévient la maladie',
    statut: 'interdit',
    source: 'Règlement (CE) 1924/2006, art. 7',
  },
  {
    motif: 'remplace un traitement',
    statut: 'interdit',
    source: 'Règlement (CE) 1924/2006, art. 7',
  },
  {
    motif: 'fait perdre du poids',
    statut: 'interdit',
    source: 'Règlement (CE) 1924/2006, art. 12',
  },
  {
    motif: 'recommandé par les médecins',
    statut: 'interdit',
    source: 'Règlement (CE) 1924/2006, art. 12',
  },

  // Formulations qui demandent une vérification au cas par cas.
  {
    motif: 'renforce les défenses naturelles',
    statut: 'a-verifier',
    source: 'Règlement (CE) 1924/2006, art. 10',
  },
  {
    motif: 'détoxifie',
    statut: 'a-verifier',
    source: 'Règlement (CE) 1924/2006, art. 10',
  },
  {
    motif: 'anti-âge',
    statut: 'a-verifier',
    source: 'Règlement (CE) 1924/2006, art. 10',
  },
]

const PRATIQUES_COMMERCIALES: readonly Regle[] = [
  // Pratiques commerciales trompeuses — Code de la consommation.
  {
    motif: 'prix le plus bas garanti',
    statut: 'interdit',
    source: 'Code de la consommation, art. L121-2',
  },
  {
    motif: 'sans aucun risque',
    statut: 'interdit',
    source: 'Code de la consommation, art. L121-2',
  },
  {
    motif: 'remboursé à 100 %',
    statut: 'interdit',
    source: 'Code de la consommation, art. L121-4',
  },
  {
    motif: 'garanti à vie',
    statut: 'interdit',
    source: 'Code de la consommation, art. L121-4',
  },
  {
    motif: 'résultats garantis',
    statut: 'interdit',
    source: 'Code de la consommation, art. L121-2',
  },

  // Superlatifs : licites seulement si la preuve est jointe.
  {
    motif: 'leader incontesté',
    statut: 'a-verifier',
    source: 'Code de la consommation, art. L121-1',
  },
  { motif: 'numéro un', statut: 'a-verifier', source: 'Code de la consommation, art. L121-1' },
  {
    motif: 'le moins cher du marché',
    statut: 'a-verifier',
    source: 'Code de la consommation, art. L121-1',
  },
  { motif: 'meilleur prix', statut: 'a-verifier', source: 'Code de la consommation, art. L121-1' },

  // Mentions licites, sous réserve d'exactitude.
  {
    motif: 'prix conseillé par le fabricant',
    statut: 'autorise',
    source: 'Code de la consommation, art. L112-1',
  },
  {
    motif: 'offre valable jusqu’au',
    statut: 'autorise',
    source: 'Code de la consommation, art. L112-1',
  },
  {
    motif: 'dans la limite des stocks disponibles',
    statut: 'autorise',
    source: 'Code de la consommation, art. L121-4',
  },
]

export const CORPUS: readonly Corpus[] = [
  {
    cle: 'allegations-sante',
    titre: 'Allégations de santé — compléments alimentaires',
    technologie: 'registre EU',
    role: 'Source de vérité réglementaire européenne',
    indices: [
      'allegation',
      'sante',
      'complement',
      'complements',
      'vitamine',
      'nutrition',
      'aliment',
      'alimentaire',
      'efsa',
      'immunitaire',
      'magnesium',
      'probiotique',
    ],
    regles: ALLEGATIONS_SANTE,
  },
  {
    cle: 'pratiques-commerciales',
    titre: 'Pratiques commerciales — Code de la consommation',
    technologie: 'Code de la consommation',
    role: 'Source de vérité du droit de la consommation',
    indices: [
      'publicite',
      'pub',
      'marketing',
      'promo',
      'promotion',
      'solde',
      'soldes',
      'prix',
      'consommation',
      'trompeur',
      'trompeuse',
      'ecommerce',
      'boutique',
      'annonce',
    ],
    regles: PRATIQUES_COMMERCIALES,
  },
]

export const corpusParDefaut = (): Corpus => CORPUS[0] as Corpus

export const trouverCorpus = (cle: string): Corpus | undefined =>
  CORPUS.find((corpus) => corpus.cle === cle)
