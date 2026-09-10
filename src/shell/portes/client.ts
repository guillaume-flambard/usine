/** Un cas figé, tel que le harnais l'a joué. */
export interface CasJoue {
  id: string
  porte: string
  /** Ce que le cas attend : `pass` ou `kill`. */
  attendu: string
  /** Ce que la porte a rendu. `erreur` quand elle a levé. */
  obtenu: string
  conforme: boolean
  /** La phrase que la porte a rendue pour justifier son verdict. */
  raison: string
  /** Ce que ce cas protège. Écrit à la main, dans `cas-portes.json`. */
  pourquoi: string
  recherches: number
}

/** Une mesure complète, un passage du harnais sur tous les cas. */
export interface Mesure {
  agent: string
  /** Quand la mesure a été faite. */
  le: string
  /** Sous quelle étiquette d'invites : `production`, `candidat`, … */
  invites: string
  total: number
  conformes: number
  duree_s: number
  cas: readonly CasJoue[]
}

export type Verdict = { etat: 'mesure'; mesure: Mesure } | { etat: 'absente'; raison: string }

/**
 * Lit la dernière mesure d'un agent.
 *
 * Aucun repli inventé : quand le service n'a rien, l'écran le dit. Un tableau
 * vide se lirait comme « aucun écart », c'est-à-dire l'inverse de la vérité.
 */
export async function lireVerdict(agent: string): Promise<Verdict> {
  let reponse: Response
  try {
    reponse = await fetch(`/api/portes/${encodeURIComponent(agent)}`)
  } catch {
    return { etat: 'absente', raison: 'le service ne répond pas' }
  }
  if (!reponse.ok) {
    const corps = (await reponse.json().catch(() => null)) as { error?: string } | null
    return { etat: 'absente', raison: corps?.error ?? `le service a répondu ${reponse.status}` }
  }
  return { etat: 'mesure', mesure: (await reponse.json()) as Mesure }
}
