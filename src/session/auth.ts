import { backend } from '../backend/client.ts'
import type { SessionStatus } from './gate.ts'
import { stateOfRequest, stateOfVerification, type SignInState } from './states.ts'

// Every call the application makes to the provider's sign-in, in one place.
// The request carries no parameter restricting the code to an existing user:
// registration is refused by the provider's own setting alone. It carries no
// redirect target either: what the mail holds is a code, not a link, and
// which of the two it holds is the provider's template's to decide.

export interface SessionState {
  status: SessionStatus
  email?: string
}

export function onSession(listener: (state: SessionState) => void): () => void {
  const { data } = backend.auth.onAuthStateChange((_event, session) => {
    listener(session ? { status: 'present', email: session.user.email } : { status: 'absent' })
  })
  return () => data.subscription.unsubscribe()
}

export async function requestCode(email: string): Promise<SignInState> {
  try {
    const { error } = await backend.auth.signInWithOtp({ email })
    return stateOfRequest(error)
  } catch {
    return 'unavailable'
  }
}

// A verified code establishes the session through the client, which tells
// the listener above; nothing here acts on success.
export async function verifyCode(email: string, token: string): Promise<SignInState | undefined> {
  try {
    const { error } = await backend.auth.verifyOtp({ email, token, type: 'email' })
    return stateOfVerification(error)
  } catch {
    return 'unavailable'
  }
}

// Sign out ends the session on this device only. The client removes it
// before asking the provider to revoke it, so this never waits on the
// network; signing out everywhere would be a different control.
export async function signOut(): Promise<void> {
  await backend.auth.signOut({ scope: 'local' })
}
