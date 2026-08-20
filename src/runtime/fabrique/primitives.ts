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
  /** Le corps rendu lisible, pour l'inspection côte à côte. */
  source: string
  appliquer: Primitive
}

const decouper: DescriptionPrimitive = {
  nom: 'decouper-allegations',
  resume: 'Découpe le texte en allégations, une par phrase.',
  source: `passe => ({
  ...passe,
  allegations: passe.texte
    .split(/[.;!?\\n]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
    .map(texte => ({ texte })),
})`,
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
  source: `passe => ({
  ...passe,
  verdicts: passe.allegations.map(a => {
    const regle = passe.regles.find(r => a.texte.toLowerCase().includes(r.motif))
    return regle
      ? { texte: a.texte, statut: regle.statut, source: regle.source }
      : { texte: a.texte, statut: 'a-verifier' }
  }),
})`,
  appliquer: (passe) => ({
    ...passe,
    verdicts: passe.allegations.map((allegation) => {
      const regle = passe.regles.find((r) =>
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
  source: `passe => ({
  ...passe,
  verdicts: passe.verdicts.map(v =>
    v.statut !== 'a-verifier' && v.source === undefined
      ? { texte: v.texte, statut: 'a-verifier' }
      : v,
  ),
})`,
  appliquer: (passe) => ({
    ...passe,
    verdicts: passe.verdicts.map((verdict) =>
      verdict.statut !== 'a-verifier' && verdict.source === undefined
        ? { texte: verdict.texte, statut: 'a-verifier' as const }
        : verdict,
    ),
  }),
}

export const REGISTRE_PRIMITIVES: ReadonlyMap<string, DescriptionPrimitive> = new Map(
  [decouper, classer, exigerSource].map((primitive) => [primitive.nom, primitive]),
)

export const nomsDePrimitives = (): readonly string[] => [...REGISTRE_PRIMITIVES.keys()]
