/**
 * Who is at the door (MEM-60, MEM-83). The atelier is closed by default: the
 * API answers 401 without a Pocket ID session. The page itself is public and
 * offers to sign in.
 *
 * A development API may run with the atelier open (USINE_ATELIER_OUVERT=1):
 * then there is no session, yet the API answers. One authenticated route says
 * which case this is.
 */
export type Door = 'checking' | 'in' | 'out' | 'unreachable'

export const SIGN_IN_URL = '/auth/oidc/login'

type Fetch = typeof fetch
const call: Fetch = (...args) => globalThis.fetch(...args)

export async function knock(fetchImpl: Fetch = call): Promise<Door> {
  try {
    const session = await fetchImpl('/auth/session', { credentials: 'same-origin' })
    if (session.ok) {
      const body = (await session.json()) as { authenticated?: boolean }
      if (body.authenticated) return 'in'
    }
    const probe = await fetchImpl('/api/specialists', { credentials: 'same-origin' })
    if (probe.status === 401) return 'out'
    return probe.ok ? 'in' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}
