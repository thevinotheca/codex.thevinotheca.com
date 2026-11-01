import { LocalEntryStore } from './local.ts'
import type { Codex } from './entry.ts'
import type { EntryStore } from './store.ts'

// The one place an implementation of the seam is chosen. Only the local
// store exists so far.
export const entryStore: EntryStore = new LocalEntryStore()

// The codex the screens read and write. Every entry is stored under it, so
// changing it is a migration.
export const CODEX: Codex = 'vini'

export type { EntryStore, EntryPage, Page } from './store.ts'
export * from './entry.ts'
