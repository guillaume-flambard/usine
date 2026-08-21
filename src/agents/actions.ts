// Le vocabulaire d'action d'un agent libre.
//
// Un agent n'a pas de comportement écrit : il a une mission, et à chaque tour
// il choisit des actions. Ce fichier définit ce qu'il a le droit de faire, et
// surtout comment on lit sa réponse — un modèle rend du texte, et ce texte est
// une donnée hostile jusqu'à preuve du contraire.

/** Faire exister un agent qui n'existait pas. */
export interface ActionCreer {
  type: 'creer'
  nom: string
  libelle: string
  role: string
  /** Ce qu'on lui demande d'accomplir, en français. */
  mission: string
  injecte: readonly string[]
  fournit: readonly string[]
}

/** Poser une question à un agent vivant et attendre sa réponse. */
export interface ActionDemander {
  type: 'demander'
  a: string
  question: string
}

/** Écrire un outil et le charger à chaud. Le code est du vrai code. */
export interface ActionFabriquer {
  type: 'fabriquer'
  nom: string
  /** Le nom sous lequel l'outil publiera sa fonction. */
  fournit: string
  /** Une expression JavaScript qui s'évalue en fonction. */
  code: string
}

/** Publier une valeur sous un nom que cet agent a le droit de publier. */
export interface ActionPublier {
  type: 'publier'
  nom: string
  texte: string
}

/** Retirer un agent que celui-ci a créé. */
export interface ActionRetirer {
  type: 'retirer'
  nom: string
}

/** Dire quelque chose au fil du run. */
export interface ActionDire {
  type: 'dire'
  message: string
}

/** Le travail de cet agent est fini. */
export interface ActionTerminer {
  type: 'terminer'
  resume: string
}

export type Action =
  | ActionCreer
  | ActionDemander
  | ActionFabriquer
  | ActionPublier
  | ActionRetirer
  | ActionDire
  | ActionTerminer

const chaine = (valeur: unknown, maximum: number): string =>
  typeof valeur === 'string' ? valeur.slice(0, maximum) : ''

const liste = (valeur: unknown): readonly string[] =>
  Array.isArray(valeur)
    ? valeur.filter((v): v is string => typeof v === 'string').map((v) => v.slice(0, 40))
    : []

const NOM = /^[a-z][a-z0-9-]{1,39}$/

/**
 * Reconstruit une action champ par champ. Ce qui ne tient pas la forme est
 * écarté ici et nulle part ailleurs : plus loin, on manipule du code et des
 * chargements à chaud.
 */
export function lireAction(brut: unknown): Action | undefined {
  if (typeof brut !== 'object' || brut === null) return undefined
  const objet = brut as Record<string, unknown>

  switch (objet.type) {
    case 'creer': {
      const nom = chaine(objet.nom, 40)
      if (!NOM.test(nom)) return undefined
      return {
        type: 'creer',
        nom,
        libelle: chaine(objet.libelle, 28) || nom,
        role: chaine(objet.role, 140) || 'Rôle non précisé',
        mission: chaine(objet.mission, 600),
        injecte: liste(objet.injecte),
        fournit: liste(objet.fournit).filter((n) => NOM.test(n)),
      }
    }
    case 'demander': {
      const a = chaine(objet.a, 40)
      const question = chaine(objet.question, 600)
      if (a.length === 0 || question.length === 0) return undefined
      return { type: 'demander', a, question }
    }
    case 'fabriquer': {
      const nom = chaine(objet.nom, 40)
      const fournit = chaine(objet.fournit, 40)
      const code = chaine(objet.code, 8000)
      if (!NOM.test(nom) || !NOM.test(fournit) || code.trim().length === 0) return undefined
      return { type: 'fabriquer', nom, fournit, code }
    }
    case 'publier': {
      const nom = chaine(objet.nom, 40)
      const texte = chaine(objet.texte, 4000)
      if (nom.length === 0) return undefined
      return { type: 'publier', nom, texte }
    }
    case 'retirer': {
      const nom = chaine(objet.nom, 40)
      return nom.length === 0 ? undefined : { type: 'retirer', nom }
    }
    case 'dire': {
      const message = chaine(objet.message, 400)
      return message.length === 0 ? undefined : { type: 'dire', message }
    }
    case 'terminer':
      return { type: 'terminer', resume: chaine(objet.resume, 600) }
    default:
      return undefined
  }
}

/** Extrait le premier objet JSON d'une réponse, préambule éventuel compris. */
export function objetJson(texte: string): unknown {
  const debut = texte.indexOf('{')
  const fin = texte.lastIndexOf('}')
  if (debut === -1 || fin <= debut) throw new Error('aucun objet JSON dans la réponse')
  return JSON.parse(texte.slice(debut, fin + 1))
}

export interface Tour {
  pensee: string
  actions: readonly Action[]
}

/** Lit un tour complet. Une action illisible est écartée, pas le tour entier. */
export function lireTour(texte: string): Tour {
  const brut = objetJson(texte)
  if (typeof brut !== 'object' || brut === null) throw new Error("la réponse n'est pas un objet")
  const objet = brut as Record<string, unknown>
  const actions = Array.isArray(objet.actions) ? objet.actions : []
  return {
    pensee: chaine(objet.pensee, 400),
    actions: actions.map(lireAction).filter((action): action is Action => action !== undefined),
  }
}
