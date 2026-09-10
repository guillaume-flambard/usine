/** Un agent, tel que l'observateur l'a vu. */
export interface Agent {
  nom: string
  /** Ce qu'il fait, en une ligne, écrit dans son `agent.yaml`. */
  quoi: string
  /** `running`, `restarting`, … ou `null` quand le container est absent. */
  statut: string | null
  /** Depuis combien de temps dans cet état, déjà mis en mots. */
  depuis: string | null
  redemarrages: number
  modele?: string
  battement?: string | null
  compteurs: Record<string, number>
  /** Ce qui ne va pas, déjà rédigé par l'observateur, sans balisage. */
  alertes: readonly string[]
}

export interface Flotte {
  le: string
  fenetre_h: number
  /** Le compte qui fait la réponse en dix secondes. */
  alertes: number
  agents: readonly Agent[]
  /** Âge de la photo, en minutes. */
  age_minutes: number | null
  /** Faux quand la photo est trop vieille pour qu'on s'y fie. */
  fraiche: boolean
}

export type EtatFlotte = { etat: 'vue'; flotte: Flotte } | { etat: 'absente'; raison: string }

/**
 * Lit la dernière observation.
 *
 * Aucun repli inventé : quand l'observateur n'a rien déposé, l'écran le dit.
 * Une flotte vide se lirait comme « aucun agent en panne », c'est-à-dire
 * l'inverse de « je ne sais pas ».
 */
export async function lireFlotte(): Promise<EtatFlotte> {
  let reponse: Response
  try {
    reponse = await fetch('/api/flotte')
  } catch {
    return { etat: 'absente', raison: 'le service ne répond pas' }
  }
  if (!reponse.ok) {
    const corps = (await reponse.json().catch(() => null)) as { error?: string } | null
    return { etat: 'absente', raison: corps?.error ?? `le service a répondu ${reponse.status}` }
  }
  return { etat: 'vue', flotte: (await reponse.json()) as Flotte }
}
