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

/** Who is in, as the session says: the door, and the account's e-mail if any. */
export interface Visit {
  door: Door
  email?: string
}

export async function visit(fetchImpl: Fetch = call): Promise<Visit> {
  try {
    const session = await fetchImpl('/auth/session', { credentials: 'same-origin' })
    if (session.ok) {
      const body = (await session.json()) as { authenticated?: boolean; email?: unknown }
      if (body.authenticated) {
        return typeof body.email === 'string' ? { door: 'in', email: body.email } : { door: 'in' }
      }
    }
    const probe = await fetchImpl('/api/specialists', { credentials: 'same-origin' })
    if (probe.status === 401) return { door: 'out' }
    return { door: probe.ok ? 'in' : 'unreachable' }
  } catch {
    return { door: 'unreachable' }
  }
}

export async function knock(fetchImpl: Fetch = call): Promise<Door> {
  return (await visit(fetchImpl)).door
}

/**
 * Initials for the avatar, from the e-mail's local part (guillaume.flambard
 * gives GF). No e-mail, no initials: the bar then shows no avatar.
 */
export function initialsOf(email: string | undefined): string {
  const local = email?.split('@')[0] ?? ''
  const parts = local.split(/[._+-]+/).filter(Boolean)
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}
