import { CompositeEntryStore } from './composite.ts'
import { LocalEntryStore } from './local.ts'
import type { Codex } from './entry.ts'
import type { EntryStore } from './store.ts'

// The one place an implementation of the seam is chosen: the local store,
// wrapped so that each write is followed by a synchronisation. The screens
// see the seam and nothing more; the synchroniser is given the store itself.
export const syncedStore = new CompositeEntryStore(new LocalEntryStore())
export const entryStore: EntryStore = syncedStore

// The codex the screens read and write. Every entry is stored under it, so
// changing it is a migration.
export const CODEX: Codex = 'vini'

export type { EntryStore, EntryPage, Page } from './store.ts'
export * from './entry.ts'
