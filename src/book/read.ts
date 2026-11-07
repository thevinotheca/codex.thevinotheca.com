import { CODEX, entryStore, type Entry } from '../entries/index.ts'

// Every entry in the codex, read through the seam a page at a time. The seam
// pages in its own order, so the whole book is read before any screen
// filters, orders or groups it.

const PAGE_SIZE = 100

export async function readBook(): Promise<Entry[]> {
  const entries: Entry[] = []
  let cursor: string | undefined
  do {
    const page = await entryStore.listEntries(CODEX, { limit: PAGE_SIZE, cursor })
    entries.push(...page.entries)
    cursor = page.nextCursor
  } while (cursor !== undefined)
  return entries
}
