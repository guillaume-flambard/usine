// Le port de raisonnement. Un agent ne parle jamais à un fournisseur : il
// consomme ce port. L'implémentation déterministe est le défaut, et le
// repli en cas d'échec est écrit une seule fois, ici.

export interface Demande {
  /** Qui demande, pour la traçabilité. */
  role: string
  /** Ce qu'on attend, en une phrase. */
  instruction: string
  /** Ce dont il dispose pour répondre. */
  contexte: string
  /**
   * La réponse écrite à la main. C'est elle que rend le mode déterministe,
   * et c'est sur elle que le mode LLM retombe en cas d'échec : le run ne
   * s'arrête jamais faute de modèle.
   */
  repli: string
}

/**
 * D'où vient un raisonnement. `demonstration` est le mode du site sans clé :
 * les réponses sont préparées d'avance, et l'écran le dit — un run préparé
 * qui se ferait passer pour un run vivant serait exactement le mensonge que
 * ce produit refuse.
 */
export type OrigineRaisonnement = 'deterministe' | 'llm' | 'demonstration'

export interface Raisonnement {
  texte: string
  origine: OrigineRaisonnement
  /** Renseigné seulement quand un modèle a réellement été appelé. */
  tokens?: { entree: number; sortie: number }
  /** Ce qui a fait échouer l'appel, quand on est retombé sur le repli. */
  echec?: string
}

export interface Raisonneur {
  readonly origine: OrigineRaisonnement
  raisonner(demande: Demande): Promise<Raisonnement>
}

/**
 * Le défaut. Aucun réseau, aucune clé, aucun token : la réponse écrite à la
 * main est rendue telle quelle. Ce qui est déterministe, c'est le jugement —
 * pas l'existence de l'agent ni son travail.
 */
export function raisonneurDeterministe(): Raisonneur {
  return {
    origine: 'deterministe',
    raisonner: (demande) =>
      Promise.resolve({ texte: demande.repli, origine: 'deterministe' as const }),
  }
}
