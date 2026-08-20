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
  raison?: 'aucune-regle' | 'formulation-negative' | 'source-absente'
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

const decouper: DescriptionPrimitive = {
  nom: 'decouper-allegations',
  resume: 'Découpe le texte en allégations, une par phrase.',
  appliquer: (passe) => ({
    ...passe,
    allegations: passe.texte
      .split(/[.;!?\n]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map((texte) => ({ texte })),
  }),
}

const classer: DescriptionPrimitive = {
  nom: 'classer-par-regles',
  resume: 'Confronte chaque allégation aux règles publiées par la source de vérité.',
  appliquer: (passe) => ({
    ...passe,
    verdicts: passe.allegations.map((allegation) => {
      // Un motif vide correspondrait à toutes les allégations et leur
      // collerait un verdict tranché : on l'écarte.
      const regle = passe.regles.find(
        (r) =>
          r.motif.trim().length > 0 &&
          allegation.texte.toLowerCase().includes(r.motif.toLowerCase()),
      )
      return regle === undefined
        ? {
            texte: allegation.texte,
            statut: 'a-verifier' as const,
            raison: 'aucune-regle' as const,
          }
        : { texte: allegation.texte, statut: regle.statut, source: regle.source }
    }),
  }),
}

/**
 * Une allégation niée ne dit pas ce que dit l'allégation. « Ne guérit pas »
 * n'est pas « guérit » — et le classer « interdit » avec une citation
 * réglementaire à l'appui serait exactement le genre de verdict faux mais
 * bien sourcé qui détruit la confiance du métier.
 */
const NEGATIONS = [
  // `\w` ne couvre pas les lettres accentuées en JavaScript : « ne guérit
  // pas » passait au travers. On travaille en propriétés Unicode.
  /(^|\s)ne\s+[\p{L}’'-]+\s+(pas|plus|jamais|aucun|aucune)(\s|$|[.,;!?])/iu,
  /(^|\s)n['’]\s*[\p{L}’'-]+\s+(pas|plus|jamais|aucun|aucune)(\s|$|[.,;!?])/iu,
  /(^|\s)sans\s+[\p{L}’'-]+/iu,
]

const ecarterLesNegations: DescriptionPrimitive = {
  nom: 'ecarter-les-negations',
  resume: 'Retire du classement les allégations formulées à la forme négative.',
  appliquer: (passe) => ({
    ...passe,
    verdicts: passe.verdicts.map((verdict) =>
      NEGATIONS.some((motif) => motif.test(verdict.texte)) && verdict.statut !== 'a-verifier'
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
