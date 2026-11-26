import { useSyncExternalStore } from 'react'
import { syncedStore } from '../entries/index.ts'
import { onSession } from '../session/auth.ts'
import { backend } from './client.ts'
import { storedConsent } from './consent.ts'
import { Synchroniser, type SyncState } from './reconcile.ts'

// The one synchroniser, and what starts it: a session appearing, a write
// through the seam, and the browser reporting the connection back. Nothing
// else, no interval, and no control for the member.

export const synchroniser = new Synchroniser(
  backend,
  syncedStore.device,
  storedConsent(() => window.localStorage),
)

export function startSynchronisation(): () => void {
  const request = () => void synchroniser.request()
  const offWrite = syncedStore.onWrite(request)
  // Out of the provider's auth callback before the client is used again:
  // the callback runs while the client holds its session lock.
  const offSession = onSession((state) => {
    const present = state.status === 'present'
    setTimeout(() => void synchroniser.sessionChanged(present), 0)
  })
  window.addEventListener('online', request)
  return () => {
    offWrite()
    offSession()
    window.removeEventListener('online', request)
  }
}

export function useSync(): SyncState {
  return useSyncExternalStore(synchroniser.subscribe, synchroniser.getState)
}
