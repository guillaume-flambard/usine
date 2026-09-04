// Les droits de la personne sur son compte : voir, emporter, effacer.
//
// Same-origin, le cookie de session voyage seul. Comme ailleurs, on rend des
// valeurs simples et on n'emporte pas la page sur une erreur réseau.

const BASE = '/api/account'

/** Ce que le service détient sur la personne connectée. */
export interface AccountSummary {
  email: string
  org: string
  runs: number
  trashed: number
}

/** Le résumé du compte, ou `null` si non connecté / indisponible. */
export async function accountSummary(
  base = BASE,
  call: typeof fetch = globalThis.fetch,
): Promise<AccountSummary | null> {
  try {
    const response = await call(base, {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return null
    const body = (await response.json()) as Partial<AccountSummary>
    if (typeof body.email === 'string' && typeof body.org === 'string') {
      return {
        email: body.email,
        org: body.org,
        runs: Number(body.runs ?? 0),
        trashed: Number(body.trashed ?? 0),
      }
    }
    return null
  } catch {
    return null
  }
}

/** L'adresse d'export de toutes ses données (téléchargement). */
export const accountExportUrl = (base = BASE): string => `${base}/export`

/**
 * Efface le compte et tout ce qui s'y rattache. Irréversible côté atelier.
 * Rend `true` si le service l'a confirmé.
 */
export async function eraseAccount(
  base = BASE,
  call: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  try {
    const response = await call(base, {
      method: 'DELETE',
      credentials: 'same-origin',
      signal: AbortSignal.timeout(15_000),
    })
    return response.ok
  } catch {
    return false
  }
}
