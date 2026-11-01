import type {
  Codex,
  DistinctField,
  Entry,
  EntryDraft,
  EntryPatch,
} from './entry.ts'

// The seam. Every screen reaches entries through this interface and nothing
// else. Every method is async, whatever the implementation behind it. There
// is no owner parameter: the local store has one user, and the server will
// derive the owner from the session. No filter crosses the seam; filtering
// runs in memory.

export interface Page {
  limit: number
  cursor?: string
}

export interface EntryPage {
  entries: Entry[]
  nextCursor?: string
}

export interface EntryStore {
  listEntries(codex: Codex, page: Page): Promise<EntryPage>
  getEntry(id: string): Promise<Entry | undefined>
  createEntry(codex: Codex, draft: EntryDraft): Promise<Entry>
  updateEntry(id: string, patch: EntryPatch): Promise<Entry>
  deleteEntry(id: string): Promise<void>
  exportEntries(): Promise<Entry[]>
  listDistinct(field: DistinctField): Promise<string[]>
}
