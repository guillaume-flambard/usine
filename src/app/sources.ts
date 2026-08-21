// Brancher un comportement sur une source réelle.
//
// Un comportement n'a pas de réseau, et c'est délibéré : le fil isolé lui a
// retiré `fetch`. Ce qu'il reçoit, c'est de la **donnée déjà allée chercher**
// — par le service, sur une liste blanche qu'il ne choisit pas.
//
// L'agent nomme une source ; il ne fournit jamais une adresse. C'est ce qui
// sépare un produit d'un proxy ouvert.

/** Ce qu'une source rend, tel que le service le renvoie. */
export interface SourceAnswer {
  body: string
  truncated: boolean
}

/** Ce qu'un comportement branché reçoit, en JSON, à la place du texte brut. */
export interface WiredInput {
  entree: string
  donnees: string
  /** Présent quand la source n'a pas répondu : le comportement peut le dire. */
  panne?: string
}

export type SourceFetcher = (name: string, query: string) => Promise<SourceAnswer>

const ENDPOINT = '/api/sources'

/** Va chercher par le service. Le navigateur ne joint jamais une source. */
export function serviceFetcher(
  endpoint = ENDPOINT,
  call: typeof fetch = globalThis.fetch,
): SourceFetcher {
  return async (name, query) => {
    const response = await call(`${endpoint}/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20_000),
    })
    const body = (await response.json()) as { body?: unknown; truncated?: unknown; error?: unknown }
    if (!response.ok) {
      throw new Error(typeof body.error === 'string' ? body.error : `source indisponible`)
    }
    return {
      body: typeof body.body === 'string' ? body.body : '',
      truncated: body.truncated === true,
    }
  }
}

/** Les noms de sources que le service sert, demandés à l'exécution. */
export async function availableSources(
  endpoint = ENDPOINT,
  call: typeof fetch = globalThis.fetch,
): Promise<readonly { name: string; description: string }[]> {
  try {
    const response = await call(endpoint, { signal: AbortSignal.timeout(6_000) })
    if (!response.ok) return []
    const body = (await response.json()) as { sources?: unknown }
    if (!Array.isArray(body.sources)) return []
    return body.sources.filter(
      (entry): entry is { name: string; description: string } =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { name?: unknown }).name === 'string' &&
        typeof (entry as { description?: unknown }).description === 'string',
    )
  } catch {
    return []
  }
}

/**
 * Prépare l'entrée d'un comportement branché.
 *
 * Une source en panne ne fait pas tomber l'appel : le comportement reçoit la
 * panne dans son entrée et décide quoi en dire. Un créneau vide serait pire
 * qu'un message imparfait.
 */
export async function wiredInput(
  source: string,
  input: string,
  fetcher: SourceFetcher,
): Promise<string> {
  let payload: WiredInput
  try {
    const answer = await fetcher(source, input)
    payload = { entree: input, donnees: answer.body }
  } catch (cause) {
    payload = {
      entree: input,
      donnees: '',
      panne: cause instanceof Error ? cause.message : String(cause),
    }
  }
  return JSON.stringify(payload)
}
