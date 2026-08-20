// Frontière publique du noyau de composition.
// Aucun type de `cordis` n'apparaît ici : c'est ce qui permet au reste de
// l'application d'ignorer le moteur.

declare const marqueIdComposant: unique symbol

/** Identifiant d'un composant vivant. Seul le noyau peut en produire. */
export type IdComposant = string & { readonly [marqueIdComposant]: true }

/** Ce qu'un nœud du graphe montre de ce composant. */
export interface Presentation {
  /**
   * Le nom court affiché dans le nœud. Le `nom` du composant est son
   * identité technique et déborde souvent d'un cadre de 140 px.
   */
  libelle?: string
  /** Le rôle, en une ligne, tel qu'il s'affiche au survol. */
  role: string
  /**
   * La technologie que ce composant exécute réellement.
   * Laisser vide quand il n'en exécute aucune : un nœud n'affiche jamais
   * une pile qu'il ne fait pas tourner.
   */
  technologie?: string
}

/** Annule un effet. Rendu par la fonction passée à `effet`. */
export type Annulation = () => void

/**
 * Ce qu'un composant reçoit à son activation. Volontairement étroit :
 * c'est ce qui l'empêche d'atteindre le moteur directement.
 *
 * Toutes ces méthodes sont inertes une fois le composant désactivé ou
 * libéré — un composant qui garde sa façade au-delà d'un `await` ne peut
 * pas faire remonter une erreur du moteur.
 */
export interface ContexteComposant {
  /** L'identifiant de ce composant. */
  readonly id: IdComposant
  /** Installe un effet et son inverse. L'inverse est joué à la libération. */
  effet(installer: () => Annulation, libelle: string): void
  /** Publie une valeur sous un nom de dépendance déclaré dans `fournit`. */
  fournir(nom: string, valeur: unknown): void
  /** Lit une dépendance déclarée dans `injecte`. */
  lire<T = unknown>(nom: string): T | undefined
  /** Émet un message destiné à la narration. */
  emettre(message: string): void
  /** Signale que le travail de ce composant est terminé. */
  terminer(): void
  /**
   * Charge un composant enfant. Sa libération suit celle de ce composant.
   * Rend `undefined` quand le chargement est refusé — un nom de dépendance
   * déjà pris, par exemple.
   */
  charger(composant: Composant): Promise<IdComposant | undefined>
}

/**
 * Un agent ou un outil. Les deux ont exactement la même forme.
 *
 * `applique` est **synchrone**. Un travail asynchrone se lance depuis un
 * effet, avec son annulation : une promesse rejetée hors de `applique`
 * échapperait au noyau et le composant serait annoncé actif à tort.
 */
export interface Composant {
  nom: string
  /** Noms de dépendances requises. Le composant reste inactif tant qu'il en manque une. */
  injecte?: readonly string[]
  /** Noms de dépendances que ce composant publie. */
  fournit?: readonly string[]
  presentation: Presentation
  applique(contexte: ContexteComposant): void
}

/** Toute erreur franchissant la frontière du noyau prend cette forme. */
export interface ErreurComposant {
  code: CodeErreur
  message: string
  /** Absent quand l'erreur précède l'allocation d'un identifiant. */
  composant?: IdComposant
  /** Le nom du composant concerné, toujours renseigné. */
  nom: string
}

export type CodeErreur =
  | 'nom-deja-fourni'
  | 'echec-activation'
  | 'dependance-inconnue'
  | 'echec-chargement'
  /** Un abonné du flux a levé. Ce n'est pas une faute du composant. */
  | 'incident-abonne'

/** L'état de cycle de vie d'un composant, tel que le noyau le connaît. */
export type EtatComposant = 'en-attente' | 'actif' | 'en-erreur' | 'libere'

/**
 * Pourquoi un composant s'est désactivé. Discriminé plutôt que textuel :
 * un nom de dépendance et une libération ne doivent pas pouvoir se confondre.
 */
export type CauseDesactivation =
  { genre: 'dependance-partie'; noms: readonly string[] } | { genre: 'liberation' }

/** Une arête du graphe : qui dépend de quoi, par quel nom. */
export interface Dependance {
  de: IdComposant
  vers: IdComposant
  nom: string
}

/** Un composant tel que la topologie le décrit. */
export interface NoeudTopologie {
  id: IdComposant
  nom: string
  etat: EtatComposant
  presentation: Presentation
  injecte: readonly string[]
  fournit: readonly string[]
  /** Vrai quand le composant a signalé la fin de son travail. */
  termine: boolean
  /** Le composant qui l'a chargé, absent quand il vient de la racine. */
  parent?: IdComposant
}

/** Photographie de la topologie à un instant donné. */
export interface Topologie {
  composants: readonly NoeudTopologie[]
  dependances: readonly Dependance[]
}
