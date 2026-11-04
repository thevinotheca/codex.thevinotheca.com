import type { Codex, EntryDraft, EntryStore } from '../entries/index.ts'

// Export and import, through the seam alone. The file is what exportEntries
// returns. Import writes each entry with createEntry, under the identifier
// the file carries; the store's own uniqueness is the collision check, so an
// identifier already in the store, live or deleted, is skipped and never
// overwritten. This reconciles two stores by hand; it merges no edits.

export interface ImportResult {
  written: number
  skipped: number
  refused: number
}

const DRAFT_KEYS = [
  'id',
  'producer',
  'wine',
  'vintage',
  'rating',
  'grape',
  'colour',
  'country',
  'region',
  'dateTasted',
  'latitude',
  'longitude',
] as const

export async function exportFile(store: EntryStore): Promise<Blob> {
  const entries = await store.exportEntries()
  return new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
}

export function exportFileName(now = new Date()): string {
  return `codex-${now.toISOString().slice(0, 10)}.json`
}

// The file must hold an array; each element is judged by the seam.
export function parseExport(text: string): unknown[] {
  const parsed: unknown = JSON.parse(text)
  if (!Array.isArray(parsed)) throw new Error('The file does not hold a list of entries.')
  return parsed
}

// A write refused because the identifier is already stored.
function isDuplicate(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'ConstraintError'
}

export async function importEntries(store: EntryStore, items: unknown[]): Promise<ImportResult> {
  const result: ImportResult = { written: 0, skipped: 0, refused: 0 }
  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      result.refused++
      continue
    }
    const record = item as Record<string, unknown>
    const draft: Record<string, unknown> = {}
    for (const key of DRAFT_KEYS) {
      if (record[key] !== undefined) draft[key] = record[key]
    }
    // A tombstone in a file is not written as a live entry.
    if (typeof draft.id !== 'string' || typeof record.codex !== 'string' || record.deletedAt !== undefined) {
      result.refused++
      continue
    }
    try {
      await store.createEntry(record.codex as Codex, draft as unknown as EntryDraft)
      result.written++
    } catch (e) {
      if (isDuplicate(e)) result.skipped++
      else result.refused++
    }
  }
  return result
}
