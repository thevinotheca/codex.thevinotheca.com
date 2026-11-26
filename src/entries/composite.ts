import type { Codex, DistinctField, Entry, EntryDraft, EntryPatch } from './entry.ts'
import type { LocalEntryStore } from './local.ts'
import type { EntryPage, EntryStore, Page } from './store.ts'

// The seam as the screens are given it: every method is the local store's,
// unchanged, and each write, once it has landed on the device, tells whoever
// is listening that a synchronisation is due. The write never waits on that,
// and nothing the listener does can fail it.
//
// The device's own records, tombstones included, are reached through
// `device`, which the EntryStore interface does not carry.

export class CompositeEntryStore implements EntryStore {
  private readonly listeners = new Set<() => void>()
  readonly device: LocalEntryStore

  constructor(device: LocalEntryStore) {
    this.device = device
  }

  // Called after every write through the seam. Returns the unsubscribe.
  onWrite(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private written(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // A listener cannot undo a write that has landed.
      }
    }
  }

  listEntries(codex: Codex, page: Page): Promise<EntryPage> {
    return this.device.listEntries(codex, page)
  }

  getEntry(id: string): Promise<Entry | undefined> {
    return this.device.getEntry(id)
  }

  async createEntry(codex: Codex, draft: EntryDraft): Promise<Entry> {
    const entry = await this.device.createEntry(codex, draft)
    this.written()
    return entry
  }

  async updateEntry(id: string, patch: EntryPatch): Promise<Entry> {
    const entry = await this.device.updateEntry(id, patch)
    this.written()
    return entry
  }

  async deleteEntry(id: string): Promise<void> {
    await this.device.deleteEntry(id)
    this.written()
  }

  exportEntries(): Promise<Entry[]> {
    return this.device.exportEntries()
  }

  listDistinct(field: DistinctField): Promise<string[]> {
    return this.device.listDistinct(field)
  }
}
