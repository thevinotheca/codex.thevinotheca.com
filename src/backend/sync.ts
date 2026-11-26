import type { SupabaseClient } from '@supabase/supabase-js'
import { CODEX, type Entry, type EntryFields } from '../entries/index.ts'

// The sync client: two operations between the local store and the provider's
// entries relation, and no more. It is not an implementation of the seam and
// nothing here appears in the seam's signatures. A pull reads tombstones,
// which the seam's own reads never return, because a deletion has to reach
// the member's other devices.
//
// The row carries id, codex, updated_at and deleted_at as columns, and the
// rest of the entry in payload. user_id is never sent: the relation defaults
// it to the session's identity. created_at is never sent and is dropped on
// read: it is assigned by the server and must never order writes.

type Payload = Pick<Entry, keyof EntryFields | 'schemaVersion' | 'latitude' | 'longitude'>

export type EntryRow = {
  id: string
  codex: string
  updated_at: string
  deleted_at: string | null
  payload: Payload
  user_id: string
  created_at: string
}

type EntryInsert = Pick<EntryRow, 'id' | 'codex' | 'updated_at' | 'deleted_at' | 'payload'>
type EntryUpdate = Pick<EntryRow, 'updated_at' | 'deleted_at' | 'payload'>
type PulledRow = Pick<EntryRow, 'id' | 'codex' | 'updated_at' | 'deleted_at' | 'payload'>

export type Database = {
  public: {
    Tables: {
      entries: {
        Row: EntryRow
        Insert: EntryInsert
        Update: EntryUpdate
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
  }
}

export type Backend = SupabaseClient<Database>

// Below the Data API's ceiling of one thousand rows a request.
export const PAGE_SIZE = 500

const COLUMNS = 'id,codex,updated_at,deleted_at,payload'

const PAYLOAD_KEYS = [
  'schemaVersion',
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
] as const satisfies readonly (keyof Payload)[]

// The relation's check admits more than one codex; the wire carries only the
// one the screens use.
function wireCodex(entry: Entry): string {
  if (entry.codex !== CODEX) throw new Error(`Entry ${entry.id} is not in codex ${CODEX}`)
  return entry.codex
}

// The server returns timestamps in its own notation; the local store
// compares them as ISO strings, so they come back in that notation.
function instant(value: string): string {
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) throw new Error(`Not a timestamp: ${value}`)
  return new Date(ms).toISOString()
}

function toPayload(entry: Entry): Payload {
  const payload: Record<string, unknown> = {}
  for (const key of PAYLOAD_KEYS) {
    if (entry[key] !== undefined) payload[key] = entry[key]
  }
  return payload as Payload
}

export function toInsert(entry: Entry): EntryInsert {
  return {
    id: entry.id,
    codex: wireCodex(entry),
    updated_at: entry.updatedAt,
    deleted_at: entry.deletedAt ?? null,
    payload: toPayload(entry),
  }
}

export function toUpdate(entry: Entry): EntryUpdate {
  wireCodex(entry)
  return {
    updated_at: entry.updatedAt,
    deleted_at: entry.deletedAt ?? null,
    payload: toPayload(entry),
  }
}

// Only named columns are read, so created_at and user_id never reach the
// entry, whatever the row carries.
export function fromRow(row: PulledRow): Entry {
  const entry: Record<string, unknown> = { id: row.id, codex: row.codex }
  for (const key of PAYLOAD_KEYS) {
    const value = row.payload[key]
    if (value !== undefined && value !== null) entry[key] = value
  }
  entry.updatedAt = instant(row.updated_at)
  if (row.deleted_at !== null) entry.deletedAt = instant(row.deleted_at)
  return entry as unknown as Entry
}

// The member's whole record for the codex, tombstones included, paged by
// identifier as the local index orders it. No high-water mark is kept.
export async function pull(client: Backend): Promise<Entry[]> {
  const entries: Entry[] = []
  let cursor: string | undefined
  for (;;) {
    let query = client.from('entries').select(COLUMNS).eq('codex', CODEX)
    if (cursor !== undefined) query = query.gt('id', cursor)
    const { data, error } = await query.order('id').limit(PAGE_SIZE)
    if (error) throw error
    entries.push(...data.map(fromRow))
    if (data.length < PAGE_SIZE) return entries
    cursor = data[data.length - 1].id
  }
}

export interface Pending {
  insert: readonly Entry[]
  update: readonly Entry[]
}

// Writes the given rows. A deletion is an update carrying deleted_at; nothing
// is ever deleted. Every row is mapped before any request, so an entry the
// wire refuses sends nothing at all.
export async function push(client: Backend, { insert, update }: Pending): Promise<void> {
  const inserts = insert.map(toInsert)
  const updates = update.map((entry) => [entry.id, toUpdate(entry)] as const)
  if (inserts.length > 0) {
    const { error } = await client.from('entries').insert(inserts)
    if (error) throw error
  }
  for (const [id, row] of updates) {
    const { error } = await client.from('entries').update(row).eq('id', id)
    if (error) throw error
  }
}
