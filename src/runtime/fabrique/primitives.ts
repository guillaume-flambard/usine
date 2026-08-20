// Le registre des primitives. Une spécification ne peut nommer que ce qui
// vit ici : sans registre unique, deux constructeurs définiraient chacun
// leur vocabulaire et produiraient des composants inassemblables.

/** Une allégation repérée dans un texte, avant tout verdict. */
export interface Allegation {
  texte: string
}

export interface Verdict {
  texte: string
  statut: 'autorise' | 'interdit' | 'a-verifier'
  /** Toujours renseignée pour un verdict tranché ; absente sinon. */
  source?: string
  /**
   * Pourquoi le verdict n'est pas tranché. Dire « aucune règle ne couvre »
   * alors qu'une règle a bien correspondu serait faux : la formulation
   * négative est une raison distincte, et l'utilisateur doit la connaître.
   */
  raison?: 'aucune-regle' | 'regle-ambigue' | 'formulation-negative' | 'source-absente'
  /** Le motif de règle qui a correspondu. Interne à la chaîne de primitives. */
  motif?: string
}

/** Ce qu'une primitive reçoit et ce qu'elle rend, d'une étape à l'autre. */
export interface Passe {
  texte: string
  allegations: readonly Allegation[]
  verdicts: readonly Verdict[]
  /** Les règles publiées par l'outil source de vérité. */
  regles: readonly { motif: string; statut: Verdict['statut']; source: string }[]
}

export type Primitive = (passe: Passe) => Passe

export interface DescriptionPrimitive {
  nom: string
  /** Ce que fait l'étape, en une ligne lisible par un non-technicien. */
  resume: string
  appliquer: Primitive
}

/**
 * La source affichée est **dérivée du code exécuté**, jamais recopiée à la
 * main : une source recopiée dérive, et le panneau finirait par montrer autre
 * chose que ce qui tourne.
 */
export const sourceDe = (primitive: DescriptionPrimitive): string => primitive.appliquer.toString()

/**
 * Normalise avant comparaison : apostrophe typographique, accents, espaces.
 * Une copie marketing tapée au clavier emploie l'apostrophe droite et laisse
 * tomber les accents ; sans normalisation, trois des règles autorisées du
 * registre ne correspondent jamais à ce qu'un humain écrit.
 */
export const normaliser = (texte: string): string =>
  texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\u2019\u02BC]/g, "'")
    // L'espace fine avant %, !, ?, : et ; est une convention typographique
    // française que la moitié des copies omet. Sans ça, « remboursé à 100 % »
    // ne reconnaîtrait pas « remboursé à 100% ».
    .replace(/\s+([%!?:;])/g, '$1')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()

/**
 * Un motif ne correspond que sur des frontières de mot. Sans ça, « traite »
 * se déclenche sur « extraite » et « soigne » sur « soigneusement » : un
 * verdict faux mais accompagné d'une citation réglementaire, ce qui détruit
 * la confiance plus sûrement qu'une absence de verdict.
 */
const echapper = (motif: string) => motif.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const motifCorrespond = (texte: string, motif: string): boolean => {
  const normalise = normaliser(motif)
  if (normalise.length === 0) return false
  return new RegExp(`(^|[^\\p{L}\\p{N}])${echapper(normalise)}([^\\p{L}\\p{N}]|$)`, 'u').test(
    normaliser(texte),
  )
}

/**
 * Les négations françaises courantes. Jusqu'à trois mots peuvent s'intercaler
 * entre « ne » et son second terme : « ne vous guérit pas », « ne guérit
 * absolument pas ».
 *
 * « sans » n'y figure pas : « sans sucre » est une mention de composition,
 * pas la négation d'une allégation de santé.
 */
const NEGATIONS = [
  /(^|\s)n(?:e|['\u2019])\s*(?:[\p{L}\u2019'-]+\s+){0,3}?(pas|plus|jamais|rien|point|nullement|guere|aucune?|ni)(\s|$|[.,;!?])/iu,
  /(^|\s)non\s+[\p{L}\u2019'-]+/iu,
]

/**
 * Une négation ne vaut que pour la proposition où elle se trouve.
 * « Il ne remplace pas un médicament mais il guérit l'arthrose » contient une
 * violation, et la rabattre sur « à vérifier » ferait taire l'outil là où il
 * doit parler.
 */
const propositions = (texte: string): readonly string[] =>
  texte.split(/,| mais | et | tandis que | alors que /i).filter((part) => part.trim().length > 0)

const estNiee = (texte: string, motif: string): boolean => {
  const porteuses = propositions(texte).filter((proposition) => motifCorrespond(proposition, motif))
  const aExaminer = porteuses.length > 0 ? porteuses : [texte]
  return aExaminer.every((proposition) => NEGATIONS.some((n) => n.test(normaliser(proposition))))
}

/**
 * Découpe en phrases sans casser les abréviations ni les décimales :
 * « Vitamine D3 500 U.I. » ne doit pas produire trois allégations.
 */
const decouper: DescriptionPrimitive = {
  nom: 'decouper-allegations',
  resume: 'Découpe le texte en allégations, une par phrase.',
  appliquer: (passe) => ({
    ...passe,
    allegations: passe.texte
      // On ne coupe qu'après une ponctuation suivie d'une majuscule : « 500
      // U.I. contribue » reste une seule allégation, « carences. Il » non.
      .split(/(?<=[.;!?])\s+(?=[\p{Lu}])|\n+/u)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map((texte) => ({ texte })),
  }),
}

/** Le rang de gravité : une interdiction ne doit jamais être masquée. */
const RANG: Record<Verdict['statut'], number> = {
  interdit: 0,
  'a-verifier': 1,
  autorise: 2,
}

const classer: DescriptionPrimitive = {
  nom: 'classer-par-regles',
  resume: 'Confronte chaque allégation aux règles publiées par la source de vérité.',
  appliquer: (passe) => ({
    ...passe,
    verdicts: passe.allegations.map((allegation) => {
      // Toutes les règles qui correspondent, pas la première trouvée : sinon
      // l'ordre du tableau déciderait, et une allégation interdite pourrait
      // être masquée par une allégation autorisée de la même phrase.
      const trouvees = passe.regles
        .filter((regle) => motifCorrespond(allegation.texte, regle.motif))
        .sort((a, b) => RANG[a.statut] - RANG[b.statut] || b.motif.length - a.motif.length)
      const regle = trouvees[0]
      if (regle === undefined) {
        return {
          texte: allegation.texte,
          statut: 'a-verifier' as const,
          raison: 'aucune-regle' as const,
        }
      }
      if (regle.statut === 'a-verifier') {
        return {
          texte: allegation.texte,
          statut: 'a-verifier' as const,
          source: regle.source,
          raison: 'regle-ambigue' as const,
        }
      }
      return {
        texte: allegation.texte,
        statut: regle.statut,
        source: regle.source,
        motif: regle.motif,
      }
    }),
  }),
}

const ecarterLesNegations: DescriptionPrimitive = {
  nom: 'ecarter-les-negations',
  resume: 'Retire du classement les allégations formulées à la forme négative.',
  appliquer: (passe) => ({
    ...passe,
    verdicts: passe.verdicts.map((verdict) =>
      verdict.statut !== 'a-verifier' &&
      verdict.motif !== undefined &&
      estNiee(verdict.texte, verdict.motif)
        ? {
            texte: verdict.texte,
            statut: 'a-verifier' as const,
            raison: 'formulation-negative' as const,
          }
        : verdict,
    ),
  }),
}

const exigerSource: DescriptionPrimitive = {
  nom: 'exiger-une-source',
  resume: "Retombe sur « à vérifier » tout verdict qui n'est pas adossé à une source.",
  appliquer: (passe) => ({
    ...passe,
    verdicts: passe.verdicts.map((verdict) =>
      verdict.statut !== 'a-verifier' && (verdict.source ?? '').trim().length === 0
        ? { texte: verdict.texte, statut: 'a-verifier' as const, raison: 'source-absente' as const }
        : verdict,
    ),
  }),
}

const PRIMITIVES = [decouper, classer, ecarterLesNegations, exigerSource].map((primitive) =>
  Object.freeze(primitive),
)

/**
 * Le registre est fermé : `chercherPrimitive` est la seule voie d'accès, et
 * personne ne peut y ajouter une entrée depuis l'extérieur. Une `ReadonlyMap`
 * ne l'aurait garanti qu'au typage.
 */
export const chercherPrimitive = (nom: string): DescriptionPrimitive | undefined =>
  PRIMITIVES.find((primitive) => primitive.nom === nom)

export const nomsDePrimitives = (): readonly string[] =>
  PRIMITIVES.map((primitive) => primitive.nom)
