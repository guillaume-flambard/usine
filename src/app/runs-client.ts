// Gérer ses runs conservés : lister, partager, mettre à la corbeille, restaurer.
//
// La tenancy rend les runs privés ; sans cette vue, un visiteur connecté ne
// verrait aucun des siens. Tout est same-origin (le proxy route `/api`), le
// cookie de session voyage seul. On rend des valeurs simples et on n'emporte
// jamais la page sur une erreur réseau : une action qui rate se signale, elle
// ne casse pas.

const BASE = '/api/runs'

/** Un run tel que la liste le décrit. */
export interface RunSummary {
  id: string
  brief: string
  events: number
  shared: boolean
}

const ok = async (
  url: string,
  method: string,
  call: typeof fetch,
): Promise<boolean> => {
  try {
    const response = await call(url, {
      method,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(15_000),
    })
    return response.ok
  } catch {
    return false
  }
}

/** Les runs du visiteur : ses runs vivants, ou sa corbeille si `trashed`. */
export async function listRuns(
  trashed = false,
  base = BASE,
  call: typeof fetch = globalThis.fetch,
): Promise<RunSummary[]> {
  try {
    const url = trashed ? `${base}?trashed=1` : base
    const response = await call(url, {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return []
    const body = (await response.json()) as { runs?: unknown }
    return Array.isArray(body.runs) ? (body.runs as RunSummary[]) : []
  } catch {
    return []
  }
}

export const shareRunById = (id: string, base = BASE, call: typeof fetch = globalThis.fetch) =>
  ok(`${base}/${encodeURIComponent(id)}/share`, 'POST', call)

export const revokeRunById = (id: string, base = BASE, call: typeof fetch = globalThis.fetch) =>
  ok(`${base}/${encodeURIComponent(id)}/revoke`, 'POST', call)

/** Met un run à la corbeille (réversible). */
export const trashRun = (id: string, base = BASE, call: typeof fetch = globalThis.fetch) =>
  ok(`${base}/${encodeURIComponent(id)}`, 'DELETE', call)

export const restoreRun = (id: string, base = BASE, call: typeof fetch = globalThis.fetch) =>
  ok(`${base}/${encodeURIComponent(id)}/restore`, 'POST', call)

/** Retire définitivement un run en corbeille. Irréversible côté atelier. */
export const purgeRun = (id: string, base = BASE, call: typeof fetch = globalThis.fetch) =>
  ok(`${base}/${encodeURIComponent(id)}/purge`, 'POST', call)

/** L'adresse d'export d'un run (téléchargement du flux d'archive). */
export const exportUrl = (id: string, base = BASE): string =>
  `${base}/${encodeURIComponent(id)}/export`
