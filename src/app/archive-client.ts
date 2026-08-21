// Pousser un run au service, et en rouvrir un par son lien.
//
// Le service ne fait que conserver : il n'interprète pas le flux, ne le
// résume pas, et ne sait pas ce qu'un run raconte. C'est voulu — le jour où
// il faudra le lire, ce sera pour l'évaluation, et ça se fera sur les runs
// stockés sans changer ce qu'on stocke.

import { readArchive, type RunArchive } from './replay'

const ENDPOINT = '/api/runs'

/**
 * Conserve un run et rend son identifiant.
 *
 * Rend `undefined` plutôt que de lever : un partage qui échoue ne doit pas
 * emporter la page d'un visiteur qui, lui, a déjà son run sous les yeux.
 */
export async function storeRun(
  archive: RunArchive,
  endpoint = ENDPOINT,
  call: typeof fetch = globalThis.fetch,
): Promise<string | undefined> {
  try {
    const response = await call(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(archive),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return undefined
    const body = (await response.json()) as { id?: unknown }
    return typeof body.id === 'string' && body.id.length > 0 ? body.id : undefined
  } catch {
    return undefined
  }
}

/** Relit un run conservé. Ce qui revient est relu comme une donnée hostile. */
export async function fetchRun(
  id: string,
  endpoint = ENDPOINT,
  call: typeof fetch = globalThis.fetch,
): Promise<RunArchive | undefined> {
  try {
    const response = await call(`${endpoint}/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return undefined
    return readArchive(await response.json())
  } catch {
    return undefined
  }
}

/** L'identifiant demandé dans l'adresse, s'il y en a un. */
export function requestedRun(search = globalThis.location?.search ?? ''): string | undefined {
  const asked = new URLSearchParams(search).get('run')
  // Borné et filtré : l'identifiant part dans une adresse, et rien ne dit
  // qu'il vient de nous.
  return asked !== null && /^[\w-]{6,64}$/.test(asked) ? asked : undefined
}

/** L'adresse à partager pour un run conservé. */
export const linkFor = (id: string, base = globalThis.location?.href ?? 'http://localhost/'): string => {
  const address = new URL(base)
  address.search = ''
  address.searchParams.set('run', id)
  return address.toString()
}
