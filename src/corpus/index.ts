// The corpora the factory has at hand. Real regulatory data, not examples:
// agents may pick from them, they never invent them. That is the honest limit
// of the exercise — the factory composes and builds freely, but it does not
// manufacture the law.

/** A corpus rule: a pattern, a verdict, and the text backing it. */
export interface Rule {
  pattern: string
  status: 'allowed' | 'forbidden' | 'to-check'
  source: string
}

export interface Corpus {
  /** Short identifier, the one an agent cites. */
  key: string
  /** The domain, as displayed. */
  title: string
  /** What is displayed under the truth-source node. */
  technology: string
  /** The source's role, in one line. */
  role: string
  /** The words of a brief that point at this corpus. */
  hints: readonly string[]
  rules: readonly Rule[]
}

const HEALTH_CLAIMS: readonly Rule[] = [
  // Allégations de santé autorisées — Règlement (UE) 432/2012, annexe.
  {
    pattern: 'contribue au fonctionnement normal du système immunitaire',
    status: 'allowed',
    source: 'Règlement (UE) 432/2012, annexe',
  },
  {
    pattern: 'contribue à réduire la fatigue',
    status: 'allowed',
    source: 'Règlement (UE) 432/2012, annexe',
  },
  {
    pattern: 'contribue au maintien d’une ossature normale',
    status: 'allowed',
    source: 'Règlement (UE) 432/2012, annexe',
  },
  {
    pattern: 'contribue à une fonction musculaire normale',
    status: 'allowed',
    source: 'Règlement (UE) 432/2012, annexe',
  },
  {
    pattern: 'contribue au maintien d’une vision normale',
    status: 'allowed',
    source: 'Règlement (UE) 432/2012, annexe',
  },

  // Allégations thérapeutiques — interdites aux denrées alimentaires.
  { pattern: 'guérit', status: 'forbidden', source: 'Règlement (CE) 1924/2006, art. 7' },
  { pattern: 'soigne', status: 'forbidden', source: 'Règlement (CE) 1924/2006, art. 7' },
  { pattern: 'traite', status: 'forbidden', source: 'Règlement (CE) 1924/2006, art. 7' },
  {
    pattern: 'prévient la maladie',
    status: 'forbidden',
    source: 'Règlement (CE) 1924/2006, art. 7',
  },
  {
    pattern: 'remplace un traitement',
    status: 'forbidden',
    source: 'Règlement (CE) 1924/2006, art. 7',
  },
  {
    pattern: 'fait perdre du poids',
    status: 'forbidden',
    source: 'Règlement (CE) 1924/2006, art. 12',
  },
  {
    pattern: 'recommandé par les médecins',
    status: 'forbidden',
    source: 'Règlement (CE) 1924/2006, art. 12',
  },

  // Formulations qui demandent une vérification au cas par cas.
  {
    pattern: 'renforce les défenses naturelles',
    status: 'to-check',
    source: 'Règlement (CE) 1924/2006, art. 10',
  },
  {
    pattern: 'détoxifie',
    status: 'to-check',
    source: 'Règlement (CE) 1924/2006, art. 10',
  },
  {
    pattern: 'anti-âge',
    status: 'to-check',
    source: 'Règlement (CE) 1924/2006, art. 10',
  },
]

const COMMERCIAL_PRACTICES: readonly Rule[] = [
  // Pratiques commerciales trompeuses — Code de la consommation.
  {
    pattern: 'prix le plus bas garanti',
    status: 'forbidden',
    source: 'Code de la consommation, art. L121-2',
  },
  {
    pattern: 'sans aucun risque',
    status: 'forbidden',
    source: 'Code de la consommation, art. L121-2',
  },
  {
    pattern: 'remboursé à 100 %',
    status: 'forbidden',
    source: 'Code de la consommation, art. L121-4',
  },
  {
    pattern: 'garanti à vie',
    status: 'forbidden',
    source: 'Code de la consommation, art. L121-4',
  },
  {
    pattern: 'résultats garantis',
    status: 'forbidden',
    source: 'Code de la consommation, art. L121-2',
  },

  // Superlatifs : licites seulement si la preuve est jointe.
  {
    pattern: 'leader incontesté',
    status: 'to-check',
    source: 'Code de la consommation, art. L121-1',
  },
  { pattern: 'numéro un', status: 'to-check', source: 'Code de la consommation, art. L121-1' },
  {
    pattern: 'le moins cher du marché',
    status: 'to-check',
    source: 'Code de la consommation, art. L121-1',
  },
  { pattern: 'meilleur prix', status: 'to-check', source: 'Code de la consommation, art. L121-1' },

  // Mentions licites, sous réserve d'exactitude.
  {
    pattern: 'prix conseillé par le fabricant',
    status: 'allowed',
    source: 'Code de la consommation, art. L112-1',
  },
  {
    pattern: 'offre valable jusqu’au',
    status: 'allowed',
    source: 'Code de la consommation, art. L112-1',
  },
  {
    pattern: 'dans la limite des stocks disponibles',
    status: 'allowed',
    source: 'Code de la consommation, art. L121-4',
  },
]

export const CORPUS: readonly Corpus[] = [
  {
    key: 'health-claims',
    title: 'Allégations de santé — compléments alimentaires',
    technology: 'registre EU',
    role: 'Source de vérité réglementaire européenne',
    hints: [
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
    rules: HEALTH_CLAIMS,
  },
  {
    key: 'commercial-practices',
    title: 'Pratiques commerciales — Code de la consommation',
    technology: 'Code de la consommation',
    role: 'Source de vérité du droit de la consommation',
    hints: [
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
    rules: COMMERCIAL_PRACTICES,
  },
]

export const defaultCorpus = (): Corpus => CORPUS[0] as Corpus

export const findCorpus = (key: string): Corpus | undefined =>
  CORPUS.find((corpus) => corpus.key === key)
