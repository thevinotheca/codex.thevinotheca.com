import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb'
import {
  SCHEMA_VERSION,
  validateFields,
  type Codex,
  type DistinctField,
  type Entry,
  type EntryDraft,
  type EntryPatch,
} from './entry.ts'
import type { EntryPage, EntryStore, Page } from './store.ts'

// The local implementation of the seam: IndexedDB through idb.
//
// The database version is the schema version. Opening at a higher version
// migrates every record in place, keyed to the schemaVersion the record
// carries. Deletion sets a tombstone; nothing is purged.
//
// The geocoding cache is created here as its own store, beside the entries
// and outside the seam: no owner, no synchronisation, no tombstones.

// A migration takes a record at version n to version n + 1.
export type Migration = (record: Record<string, unknown>) => Record<string, unknown>
export type Migrations = Record<number, Migration>

// Version 1 is the first schema; nothing precedes it.
export const MIGRATIONS: Migrations = {}

interface CodexDB extends DBSchema {
  entries: {
    key: string
    value: Entry
    indexes: { codex: [string, string] }
  }
  geocode: {
    key: IDBValidKey
    value: unknown
  }
}

export interface LocalStoreOptions {
  name?: string
  schemaVersion?: number
  migrations?: Migrations
}

const PATCHABLE = [
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

function isLive(entry: Entry | undefined): entry is Entry {
  return entry !== undefined && entry.deletedAt === undefined
}

async function migrate(
  tx: IDBPTransaction<CodexDB, StoreNames<CodexDB>[], 'versionchange'>,
  target: number,
  migrations: Migrations,
) {
  let cursor = await tx.objectStore('entries').openCursor()
  while (cursor) {
    let record = cursor.value as unknown as Record<string, unknown>
    let version = record.schemaVersion as number
    if (version < target) {
      while (version < target) {
        const step = migrations[version]
        if (!step) throw new Error(`No migration from schema version ${version}`)
        record = step(record)
        version += 1
        record.schemaVersion = version
      }
      await cursor.update(record as unknown as Entry)
    }
    cursor = await cursor.continue()
  }
}

export class LocalEntryStore implements EntryStore {
  private readonly name: string
  private readonly schemaVersion: number
  private readonly migrations: Migrations
  private db?: Promise<IDBPDatabase<CodexDB>>

  constructor(options: LocalStoreOptions = {}) {
    this.name = options.name ?? 'codex'
    this.schemaVersion = options.schemaVersion ?? SCHEMA_VERSION
    this.migrations = options.migrations ?? MIGRATIONS
    for (let v = 1; v < this.schemaVersion; v++) {
      if (!this.migrations[v]) throw new Error(`No migration from schema version ${v}`)
    }
  }

  private open(): Promise<IDBPDatabase<CodexDB>> {
    const { schemaVersion, migrations } = this
    this.db ??= openDB<CodexDB>(this.name, schemaVersion, {
      async upgrade(db, _oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains('entries')) {
          const entries = db.createObjectStore('entries', { keyPath: 'id' })
          entries.createIndex('codex', ['codex', 'id'])
        }
        if (!db.objectStoreNames.contains('geocode')) {
          db.createObjectStore('geocode')
        }
        // A failed migration aborts the upgrade, leaving the old version intact.
        await migrate(tx, schemaVersion, migrations).catch(() => tx.abort())
      },
      blocking: () => this.close(),
    })
    return this.db
  }

  async close(): Promise<void> {
    const db = this.db
    this.db = undefined
    if (db) (await db).close()
  }

  async listEntries(codex: Codex, { limit, cursor }: Page): Promise<EntryPage> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('limit must be a positive integer')
    }
    const db = await this.open()
    const range = IDBKeyRange.bound(
      [codex, cursor ?? ''],
      [codex, []],
      cursor !== undefined,
    )
    const entries: Entry[] = []
    let more = false
    let c = await db.transaction('entries').store.index('codex').openCursor(range)
    while (c) {
      if (isLive(c.value)) {
        if (entries.length === limit) {
          more = true
          break
        }
        entries.push(c.value)
      }
      c = await c.continue()
    }
    return { entries, nextCursor: more ? entries[entries.length - 1].id : undefined }
  }

  async getEntry(id: string): Promise<Entry | undefined> {
    const entry = await (await this.open()).get('entries', id)
    return isLive(entry) ? entry : undefined
  }

  async createEntry(codex: Codex, draft: EntryDraft): Promise<Entry> {
    validateFields(draft)
    const entry: Entry = {
      ...draft,
      codex,
      schemaVersion: this.schemaVersion,
      updatedAt: new Date().toISOString(),
    }
    await (await this.open()).add('entries', entry)
    return entry
  }

  async updateEntry(id: string, patch: EntryPatch): Promise<Entry> {
    const tx = (await this.open()).transaction('entries', 'readwrite')
    const existing = await tx.store.get(id)
    if (!isLive(existing)) throw new Error(`No entry ${id}`)
    const entry: Entry = { ...existing }
    for (const key of PATCHABLE) {
      if (key in patch) Object.assign(entry, { [key]: patch[key] })
    }
    validateFields(entry)
    entry.updatedAt = new Date().toISOString()
    await tx.store.put(entry)
    await tx.done
    return entry
  }

  async deleteEntry(id: string): Promise<void> {
    const tx = (await this.open()).transaction('entries', 'readwrite')
    const existing = await tx.store.get(id)
    if (!isLive(existing)) throw new Error(`No entry ${id}`)
    await tx.store.put({ ...existing, deletedAt: new Date().toISOString() })
    await tx.done
  }

  async exportEntries(): Promise<Entry[]> {
    return (await (await this.open()).getAll('entries')).filter(isLive)
  }

  async listDistinct(field: DistinctField): Promise<string[]> {
    const values = new Set<string>()
    for (const entry of await this.exportEntries()) {
      const value = entry[field]
      if (value) values.add(value)
    }
    return [...values].sort((a, b) => a.localeCompare(b))
  }
}
