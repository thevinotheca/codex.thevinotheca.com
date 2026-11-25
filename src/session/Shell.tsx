import { useEffect, useState, type ReactNode } from 'react'
import { onSession, type SessionState } from './auth.ts'
import { SessionContext } from './context.ts'
import { decide } from './gate.ts'
import SignIn from './SignIn.tsx'

// The shell: the session state, and the gate in front of every route. It
// draws nothing of its own; each screen carries its own navigation. While
// the state is not yet known it renders nothing at all.

function Shell({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: 'unknown' })

  useEffect(() => onSession(setSession), [])

  const decision = decide(session.status)
  return (
    <SessionContext.Provider value={session}>
      {decision === 'through' ? children : decision === 'sign-in' ? <SignIn /> : null}
    </SessionContext.Provider>
  )
}

export default Shell
