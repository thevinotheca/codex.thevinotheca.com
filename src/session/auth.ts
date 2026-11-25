import { backend } from '../backend/client.ts'
import type { SessionStatus } from './gate.ts'
import { COMPLETION_PATH, stateOfRequest, type SignInState } from './states.ts'

// Every call the application makes to the provider's sign-in, in one place.
// The request carries no parameter restricting the link to an existing user:
// registration is refused by the provider's own setting alone.

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

export async function requestLink(email: string): Promise<SignInState> {
  try {
    const { error } = await backend.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${COMPLETION_PATH}` },
    })
    return stateOfRequest(error)
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
