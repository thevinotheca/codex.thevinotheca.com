import { createContext, useContext } from 'react'
import type { SessionState } from './auth.ts'

// The signed-in state, as the shell holds it, for any screen to read.

export const SessionContext = createContext<SessionState>({ status: 'unknown' })

export function useSession(): SessionState {
  return useContext(SessionContext)
}
