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
        ? { texte: allegation.texte, statut: 'a-verifier' as const }
        : { texte: allegation.texte, statut: regle.statut, source: regle.source }
    }),
  }),
}

const exigerSource: DescriptionPrimitive = {
  nom: 'exiger-une-source',
  resume: "Retombe sur « à vérifier » tout verdict qui n'est pas adossé à une source.",
  appliquer: (passe) => ({
    ...passe,
    verdicts: passe.verdicts.map((verdict) =>
      verdict.statut !== 'a-verifier' && (verdict.source ?? '').trim().length === 0
        ? { texte: verdict.texte, statut: 'a-verifier' as const }
        : verdict,
    ),
  }),
}

const PRIMITIVES = [decouper, classer, exigerSource].map((primitive) => Object.freeze(primitive))

/**
 * Le registre est fermé : `chercherPrimitive` est la seule voie d'accès, et
 * personne ne peut y ajouter une entrée depuis l'extérieur. Une `ReadonlyMap`
 * ne l'aurait garanti qu'au typage.
 */
export const chercherPrimitive = (nom: string): DescriptionPrimitive | undefined =>
  PRIMITIVES.find((primitive) => primitive.nom === nom)

export const nomsDePrimitives = (): readonly string[] =>
  PRIMITIVES.map((primitive) => primitive.nom)
