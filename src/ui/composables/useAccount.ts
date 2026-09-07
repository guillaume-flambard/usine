// Who the visitor is, and what that unlocks.
//
// Anonymous is a first-class state, not a degraded one: an anonymous visitor
// runs the demo and opens shared links. Signing in is by magic link — there is
// no password anywhere in this product — and it unlocks keeping and sharing a
// run. Erasing an account is irreversible, so it asks twice.
import { ref, type Ref } from 'vue'
import { logout, requestLink, sessionStatus, type SessionStatus } from '../../app/auth-client'
import { accountExportUrl, eraseAccount } from '../../app/account-client'

export interface AccountControl {
  session: Ref<SessionStatus>
  signInOpen: Ref<boolean>
  signInEmail: Ref<string>
  signInSent: Ref<boolean>
  /** Where the visitor downloads everything the service holds on them. */
  accountExport: string
  eraseConfirm: Ref<boolean>
  requestSignInLink: () => Promise<void>
  signOut: () => Promise<void>
  eraseAccountForGood: () => Promise<void>
  /** Qui l'on est, une fois. Silencieux : un service absent laisse anonyme. */
  loadSession: () => Promise<void>
}

export function useAccount(reportError: (message: string | undefined) => void): AccountControl {
  const session = ref<SessionStatus>({ authenticated: false })
  const signInOpen = ref(false)
  const signInEmail = ref('')
  const signInSent = ref(false)
  const eraseConfirm = ref(false)

  async function requestSignInLink() {
    const email = signInEmail.value.trim()
    if (email.length === 0) return
    const ok = await requestLink(email)
    signInSent.value = ok
    reportError(ok ? undefined : "Le lien n'a pas pu être envoyé.")
  }

  async function signOut() {
    await logout()
    session.value = { authenticated: false }
    signInSent.value = false
  }

  async function eraseAccountForGood() {
    if (!(await eraseAccount())) return
    session.value = { authenticated: false }
    eraseConfirm.value = false
  }

  async function loadSession() {
    session.value = await sessionStatus()
  }

  return {
    session,
    signInOpen,
    signInEmail,
    signInSent,
    accountExport: accountExportUrl(),
    eraseConfirm,
    requestSignInLink,
    signOut,
    eraseAccountForGood,
    loadSession,
  }
}
