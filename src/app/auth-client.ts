// Se connecter à l'atelier, et savoir qui l'on est.
//
// La connexion est sans mot de passe : on demande un lien, on le suit depuis
// son email, et le service pose une session par cookie HTTP-only. Le client ne
// lit jamais ce cookie — comme il ne touche jamais la clé du fournisseur. Il ne
// fait que trois choses : demander un lien, lire son statut, se déconnecter.
//
// Tout est same-origin : le proxy route `/api` vers le service, donc le cookie
// de session voyage seul. On l'explicite quand même (`credentials`) pour que le
// jour où une origine changerait, la panne soit ici et pas silencieuse.

const BASE = '/api/auth'

/** Ce que le service dit de la session courante. */
export type SessionStatus =
  | { authenticated: false }
  | { authenticated: true; email: string; org: string }

/**
 * Demande un lien de connexion pour cet email.
 *
 * Rend `true` dès que la demande est acceptée — jamais si un compte existe :
 * le service répond pareil dans tous les cas (pas d'oracle de compte). Rend
 * `false` seulement si la demande n'a pas abouti (réseau, quota).
 */
export async function requestLink(
  email: string,
  endpoint = `${BASE}/request-link`,
  call: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  try {
    const response = await call(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
      credentials: 'same-origin',
      signal: AbortSignal.timeout(15_000),
    })
    return response.ok
  } catch {
    return false
  }
}

/** Lit la session courante. Rend « non connecté » plutôt que de lever. */
export async function sessionStatus(
  endpoint = `${BASE}/session`,
  call: typeof fetch = globalThis.fetch,
): Promise<SessionStatus> {
  try {
    const response = await call(endpoint, {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return { authenticated: false }
    const body = (await response.json()) as Record<string, unknown>
    if (body.authenticated === true && typeof body.email === 'string' && typeof body.org === 'string') {
      return { authenticated: true, email: body.email, org: body.org }
    }
    return { authenticated: false }
  } catch {
    return { authenticated: false }
  }
}

/** Ferme la session. Rend `true` si le service l'a confirmé. */
export async function logout(
  endpoint = `${BASE}/logout`,
  call: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  try {
    const response = await call(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      signal: AbortSignal.timeout(15_000),
    })
    return response.ok
  } catch {
    return false
  }
}
