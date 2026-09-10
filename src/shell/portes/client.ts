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

/** Une mesure en cours ou finie, telle que le service la rend. */
export interface Avancement {
  id: string
  agent: string
  invites: string
  /** Secondes écoulées depuis le lancement. Comptées par le service. */
  secondes: number
  /** Les lignes que le harnais a imprimées, une par cas joué. */
  lignes: readonly string[]
  fini: boolean
  verdict: Mesure | null
  echec: string | null
}

/** Lance une mesure sous une étiquette d'invites. Rend l'état initial. */
export async function lancerMesure(agent: string, invites: string): Promise<Avancement> {
  const reponse = await fetch(`/api/portes/${encodeURIComponent(agent)}/juger`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invites }),
  })
  const corps = (await reponse.json()) as Avancement & { error?: string }
  if (!reponse.ok) throw new Error(corps.error ?? `le service a répondu ${reponse.status}`)
  return corps
}

/** Relit l'avancement d'une mesure lancée. */
export async function suivreMesure(id: string): Promise<Avancement> {
  const reponse = await fetch(`/api/portes/juger/${encodeURIComponent(id)}`)
  const corps = (await reponse.json()) as Avancement & { error?: string }
  if (!reponse.ok) throw new Error(corps.error ?? `le service a répondu ${reponse.status}`)
  return corps
}

/** Une version d'invite, telle que Langfuse la porte. */
export interface VersionInvite {
  version: number
  texte: string
  etiquettes: readonly string[]
}

/** Ce qui sert et ce qui attend, pour une porte. */
export interface InvitePorte {
  nom: string
  service: VersionInvite | null
  /** Ce qui attend d'être jugé. Absent dès que la décision est prise. */
  candidat: VersionInvite | null
  /** Une candidate déjà écartée. Montrée comme décision, pas comme choix. */
  ecartee: VersionInvite | null
}

export interface EtatInvites {
  agent: string
  invites: readonly InvitePorte[]
}

/** Ce qu'on peut poser sur une version depuis cet écran, et rien d'autre. */
export type Etiquette = 'production' | 'ecartee'

export async function lireInvites(agent: string): Promise<EtatInvites> {
  const reponse = await fetch(`/api/portes/${encodeURIComponent(agent)}/invites`)
  const corps = (await reponse.json()) as EtatInvites & { error?: string }
  if (!reponse.ok) throw new Error(corps.error ?? `le service a répondu ${reponse.status}`)
  return corps
}

/**
 * Pose une étiquette sur une version d'invite.
 *
 * `production` change ce que les agents en service utilisent, et une étiquette
 * est unique dans Langfuse : la poser ici la retire de la version qui l'avait.
 */
export async function etiqueterInvite(
  agent: string,
  nom: string,
  version: number,
  etiquette: Etiquette,
): Promise<void> {
  const reponse = await fetch(
    `/api/portes/${encodeURIComponent(agent)}/invites/${encodeURIComponent(nom)}/etiquette`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version, etiquette }),
    },
  )
  if (!reponse.ok) {
    const corps = (await reponse.json().catch(() => null)) as { error?: string } | null
    throw new Error(corps?.error ?? `le service a répondu ${reponse.status}`)
  }
}
