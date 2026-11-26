import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openDB } from 'idb'
import { createClient } from '@supabase/supabase-js'
import { CODEX, entryStore, newEntryId, syncedStore, type Entry, type EntryDraft } from '../src/entries/index.ts'
import { CompositeEntryStore } from '../src/entries/composite.ts'
import { LocalEntryStore } from '../src/entries/local.ts'
import { storedConsent } from '../src/backend/consent.ts'
import { plan, Synchroniser } from '../src/backend/reconcile.ts'
import { fromRow, PAGE_SIZE, pull, push, type Backend, type Database, type EntryRow } from '../src/backend/sync.ts'

// The sync client against a stand-in for the provider. The client is the
// pinned provider client itself; only its fetch is replaced, so every request
// asserted on here is the one that client builds. The stand-in answers the
// few requests the sync client makes as the Data API would: at most a
// thousand rows a request, timestamps in the server's notation, created_at
// and user_id assigned on insert. Nothing reaches the network. The round
// trip against the real provider is not covered here; the walk covers it.

interface Sent {
  method: string
  url: URL
  body: unknown
  response: unknown
}

// Every request made in this file, across every case.
const wire: Sent[] = []

const DATA_API_MAX_ROWS = 1000
const MAX_REQUESTS = 50

function serverTime(value: unknown): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`bad timestamp ${String(value)}`)
  return new Date(value).toISOString().replace('Z', '+00:00')
}

function reply(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function matches(row: Record<string, unknown>, column: string, filter: string | null): boolean {
  if (filter === null) return true
  const dot = filter.indexOf('.')
  const op = filter.slice(0, dot)
  const value = filter.slice(dot + 1)
  const held = String(row[column])
  if (op === 'eq') return held === value
  if (op === 'gt') return held > value
  // Timestamps compare as instants, whatever notation each side writes.
  if (op === 'lt' && column === 'updated_at') return Date.parse(held) < Date.parse(value)
  throw new Error(`unexpected operator ${op}`)
}

function project(rows: Record<string, unknown>[], select: string | null): Record<string, unknown>[] {
  if (select === null || select === '*') return rows
  const columns = select.split(',')
  return rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])))
}

// What a case may do to the stand-in between requests: run something just
// before a request is answered, refuse a method outright, or apply a write
// and then lose its response, as a dropped connection does.
interface Control {
  before?: (method: string) => void
  refuse: Set<string>
  loseResponse: Set<string>
}

function standIn() {
  // Held in insertion order, as a heap holds them; only an order clause sorts.
  const rows: Record<string, unknown>[] = []
  const requests: Sent[] = []
  const control: Control = { refuse: new Set(), loseResponse: new Set() }

  function handle(method: string, url: URL, body: unknown, prefer: string): { status: number; body?: unknown } {
    // A client that does not stop is refused, so a runaway pull fails its
    // case rather than the run.
    if (requests.length >= MAX_REQUESTS) return { status: 429, body: { message: 'too many requests' } }
    if (url.pathname !== '/rest/v1/entries') return { status: 404 }
    const params = url.searchParams
    const allowed: Record<string, string[]> = {
      GET: ['select', 'codex', 'id', 'order', 'limit'],
      POST: ['columns'],
      PATCH: ['id', 'updated_at', 'select'],
    }
    if (!allowed[method]) return { status: 405 }
    for (const key of params.keys()) {
      if (!allowed[method].includes(key)) return { status: 400, body: { message: `unexpected parameter ${key}` } }
    }

    if (method === 'GET') {
      let out = rows.filter((r) => matches(r, 'codex', params.get('codex')) && matches(r, 'id', params.get('id')))
      const order = params.get('order')
      if (order === 'id.asc') out.sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1))
      else if (order !== null) return { status: 400, body: { message: `unexpected order ${order}` } }
      const limit = Math.min(Number(params.get('limit') ?? Infinity), DATA_API_MAX_ROWS)
      out = out.slice(0, limit)
      return { status: 200, body: project(out, params.get('select')) }
    }

    if (method === 'POST') {
      for (const item of (Array.isArray(body) ? body : [body]) as Record<string, unknown>[]) {
        if (rows.some((r) => r.id === item.id)) return { status: 409, body: { code: '23505', message: 'duplicate key' } }
        if (item.codex !== 'vini' && item.codex !== 'vinitorum') {
          return { status: 400, body: { code: '23514', message: 'violates check constraint' } }
        }
        rows.push({
          user_id: 'stand-in-member',
          created_at: serverTime(new Date().toISOString()),
          ...item,
          updated_at: serverTime(item.updated_at),
          deleted_at: item.deleted_at === null ? null : serverTime(item.deleted_at),
        })
      }
      return { status: 201 }
    }

    // PATCH
    const patch = body as Record<string, unknown>
    const changed = rows.filter(
      (r) => matches(r, 'id', params.get('id')) && matches(r, 'updated_at', params.get('updated_at')),
    )
    for (const row of changed) {
      Object.assign(row, patch, {
        updated_at: serverTime(patch.updated_at),
        deleted_at: patch.deleted_at === null ? null : serverTime(patch.deleted_at),
      })
    }
    if (prefer.includes('return=representation')) return { status: 200, body: project(changed, params.get('select')) }
    return { status: 204 }
  }

  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = (init.method ?? 'GET').toUpperCase()
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    control.before?.(method)
    const result = control.refuse.has(method)
      ? { status: 500, body: { message: 'stand-in refused' } }
      : handle(method, url, body, new Headers(init.headers).get('prefer') ?? '')
    const sent = { method, url, body, response: result.body }
    requests.push(sent)
    wire.push(sent)
    if (control.loseResponse.delete(method)) throw new TypeError('connection lost after the write')
    return reply(result.status, result.body)
  }

  const client: Backend = createClient<Database>('https://stand-in.test', 'stand-in-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  })
  return { client, rows, requests, control }
}

function memoryStorage(): Storage {
  const held = new Map<string, string>()
  return {
    getItem: (k) => held.get(k) ?? null,
    setItem: (k, v) => void held.set(k, v),
    removeItem: (k) => void held.delete(k),
    clear: () => held.clear(),
    key: (i) => [...held.keys()][i] ?? null,
    get length() {
      return held.size
    },
  }
}

// A device: its own local store, its own origin's answer, and a synchroniser
// against the given stand-in, with a session present.
function device(name: string, client: Backend, storage: Storage = memoryStorage()) {
  const store = new LocalEntryStore({ name })
  const consent = storedConsent(() => storage)
  const sync = new Synchroniser(client, store, consent)
  return { store, consent, sync, storage }
}

const methodsOf = (requests: Sent[]) => requests.map((r) => r.method)

function draft(fields: Partial<EntryDraft> = {}): EntryDraft {
  return { id: newEntryId(), producer: 'Domaine Leflaive', wine: 'Puligny-Montrachet', vintage: '2019', rating: 8.5, ...fields }
}

async function tombstoneOf(name: string, id: string): Promise<Entry> {
  const db = await openDB(name)
  const record = (await db.get('entries', id)) as Entry
  db.close()
  return record
}

async function tick() {
  const start = Date.now()
  while (Date.now() === start) await new Promise((r) => setTimeout(r, 1))
}

test('an insert emits no user_id and no created_at', async () => {
  const { client, requests } = standIn()
  const store = new LocalEntryStore({ name: 'sync-insert' })
  const entries = [
    await store.createEntry(CODEX, draft({ grape: 'Chardonnay', latitude: 47, longitude: 4.7 })),
    await store.createEntry(CODEX, draft()),
  ]
  await push(client, { insert: entries, update: [] })
  await store.close()

  assert.equal(requests.length, 1)
  const [post] = requests
  assert.equal(post.method, 'POST')
  assert.ok(Array.isArray(post.body))
  for (const row of post.body as Record<string, unknown>[]) {
    assert.ok(!('user_id' in row), 'user_id sent')
    assert.ok(!('created_at' in row), 'created_at sent')
    assert.deepEqual(Object.keys(row).sort(), ['codex', 'deleted_at', 'id', 'payload', 'updated_at'])
  }
  assert.doesNotMatch(post.url.search, /user_id|created_at/)
})

test('a deletion is an update setting deleted_at and advancing updated_at, never a DELETE', async () => {
  const name = 'sync-delete'
  const { client, requests } = standIn()
  const store = new LocalEntryStore({ name })
  const created = await store.createEntry(CODEX, draft())
  await push(client, { insert: [created], update: [] })
  await tick()
  await store.deleteEntry(created.id)
  await store.close()
  const tombstone = await tombstoneOf(name, created.id)

  requests.length = 0
  await push(client, { insert: [], update: [tombstone] })
  assert.equal(requests.length, 1)
  const [patch] = requests
  assert.equal(patch.method, 'PATCH')
  assert.equal(patch.url.searchParams.get('id'), `eq.${created.id}`)
  const body = patch.body as Record<string, unknown>
  assert.equal(body.deleted_at, tombstone.deletedAt)
  assert.equal(body.updated_at, tombstone.updatedAt)
  assert.equal(body.deleted_at, body.updated_at)
  assert.ok((body.updated_at as string) > created.updatedAt)
  assert.ok(!('user_id' in body) && !('created_at' in body) && !('codex' in body) && !('id' in body))
})

test('the pull pages by id below a thousand rows and returns a record longer than a page whole, in local order', async () => {
  const name = 'sync-pages'
  const { client, rows, requests } = standIn()
  const store = new LocalEntryStore({ name })
  // Created in random identifier order, so insertion order is not id order;
  // more than the Data API returns in one request.
  const entries: Entry[] = []
  for (let i = 0; i < 1201; i++) entries.push(await store.createEntry(CODEX, draft({ rating: (i % 100) / 10 })))
  await push(client, { insert: entries, update: [] })
  // The member's rows in the other codex the relation admits.
  rows.push({ ...rows[0], id: newEntryId(), codex: 'vinitorum' })

  const local: string[] = []
  let cursor: string | undefined
  do {
    const page = await store.listEntries(CODEX, { limit: 100, cursor })
    local.push(...page.entries.map((e) => e.id))
    cursor = page.nextCursor
  } while (cursor)
  await store.close()

  requests.length = 0
  const pulled = await pull(client)

  assert.ok(PAGE_SIZE < 1000)
  assert.deepEqual(pulled.map((e) => e.id), local)
  assert.equal(pulled.length, 1201)
  assert.ok(pulled.every((e) => e.codex === CODEX))
  assert.equal(requests.length, Math.ceil(1201 / PAGE_SIZE))
  requests.forEach((req, i) => {
    assert.equal(req.method, 'GET')
    const p = req.url.searchParams
    const limit = Number(p.get('limit'))
    assert.ok(Number.isInteger(limit) && limit > 0 && limit < 1000, `limit ${p.get('limit')}`)
    assert.equal(p.get('order'), 'id.asc')
    assert.equal(p.get('codex'), `eq.${CODEX}`)
    assert.doesNotMatch(p.get('select') ?? '*', /\*|created_at|user_id/)
    if (i === 0) assert.equal(p.get('id'), null)
    else {
      const previous = requests[i - 1].response as { id: string }[]
      assert.equal(p.get('id'), `gt.${previous[previous.length - 1].id}`)
    }
  })
})

test('the pull returns rows carrying deleted_at, and the seam does not', async () => {
  const name = 'sync-tombstone'
  const { client } = standIn()
  const store = new LocalEntryStore({ name })
  const kept = await store.createEntry(CODEX, draft())
  const gone = await store.createEntry(CODEX, draft())
  await push(client, { insert: [kept, gone], update: [] })
  // A tombstone in the same millisecond as the row it follows is not a
  // later write, and the conditional update rightly leaves the row alone.
  await tick()
  await store.deleteEntry(gone.id)
  const tombstone = await tombstoneOf(name, gone.id)
  await push(client, { insert: [], update: [tombstone] })

  const pulled = await pull(client)
  assert.equal(pulled.length, 2)
  assert.deepEqual(
    pulled.find((e) => e.id === gone.id),
    tombstone,
  )
  assert.ok(pulled.find((e) => e.id === gone.id)?.deletedAt)

  assert.equal(await store.getEntry(gone.id), undefined)
  assert.deepEqual((await store.exportEntries()).map((e) => e.id), [kept.id])
  assert.deepEqual((await store.listEntries(CODEX, { limit: 10 })).entries.map((e) => e.id), [kept.id])
  await store.close()
})

test('the mapping round-trips every field and drops created_at', async () => {
  const name = 'sync-mapping'
  const { client, rows } = standIn()
  const store = new LocalEntryStore({ name })
  const full = await store.createEntry(
    CODEX,
    draft({
      grape: 'Chardonnay',
      colour: 'White',
      country: 'France',
      region: 'Burgundy',
      dateTasted: '2026-10-31',
      latitude: 46.99,
      longitude: 4.77,
    }),
  )
  const bare = await store.createEntry(CODEX, draft({ vintage: 'NV', rating: 0 }))
  const doomed = await store.createEntry(CODEX, draft({ region: 'Barolo' }))
  await store.deleteEntry(doomed.id)
  await store.close()
  const tombstone = await tombstoneOf(name, doomed.id)

  // The fixture carries what it claims: nine fields, the schema version and
  // both coordinates.
  for (const key of ['producer', 'wine', 'vintage', 'rating', 'grape', 'colour', 'country', 'region', 'dateTasted', 'schemaVersion', 'latitude', 'longitude']) {
    assert.notEqual(full[key as keyof Entry], undefined, key)
  }

  await push(client, { insert: [full, bare, tombstone], update: [] })
  for (const row of rows) {
    assert.ok(row.created_at && row.user_id)
    assert.match(row.updated_at as string, /\+00:00$/)
  }
  for (const entry of [full, bare, tombstone]) {
    const row = rows.find((r) => r.id === entry.id) as EntryRow
    const mapped = fromRow(row)
    assert.deepEqual(mapped, entry)
    assert.ok(!('createdAt' in mapped) && !('created_at' in mapped) && !('user_id' in mapped))
  }
  const pulled = await pull(client)
  for (const entry of [full, bare, tombstone]) {
    assert.deepEqual(pulled.find((e) => e.id === entry.id), entry)
  }
})

test('an entry outside the codex is refused before any request', async () => {
  const { client, requests } = standIn()
  const store = new LocalEntryStore({ name: 'sync-codex' })
  const ours = await store.createEntry(CODEX, draft())
  const other = await store.createEntry('vinitorum', draft())
  await store.close()

  await assert.rejects(push(client, { insert: [ours, other], update: [] }), /codex/)
  await assert.rejects(push(client, { insert: [], update: [ours, other] }), /codex/)
  assert.equal(requests.length, 0)
})

const payloadOf = (row: Record<string, unknown>) => row.payload as Record<string, unknown>
const later = (ms: number) => new Date(Date.now() + ms).toISOString()

test('a conditional update whose condition does not hold reports another device won, and is not an error', async () => {
  const { client, rows, requests } = standIn()
  const store = new LocalEntryStore({ name: 'sync-lost-race' })
  const mine = await store.createEntry(CODEX, draft({ rating: 5 }))
  await push(client, { insert: [mine], update: [] })
  await tick()
  const edited = await store.updateEntry(mine.id, { rating: 9 })
  await store.close()
  // Another device wrote later still.
  const theirs = later(60_000)
  rows[0].updated_at = serverTime(theirs)
  payloadOf(rows[0]).rating = 7

  requests.length = 0
  const lost = await push(client, { insert: [], update: [edited] })
  assert.deepEqual(lost.superseded, [mine.id])
  assert.equal(requests.length, 1)
  const p = requests[0].url.searchParams
  assert.equal(p.get('id'), `eq.${mine.id}`)
  assert.equal(p.get('updated_at'), `lt.${edited.updatedAt}`)
  assert.equal(p.get('select'), 'id')
  assert.equal(Date.parse(rows[0].updated_at as string), Date.parse(theirs))
  assert.equal(payloadOf(rows[0]).rating, 7)

  // Where the condition holds, the write lands and is not reported.
  rows[0].updated_at = serverTime(mine.updatedAt)
  assert.deepEqual((await push(client, { insert: [], update: [edited] })).superseded, [])
  assert.equal(payloadOf(rows[0]).rating, 9)
})

test('through the reconciler, a lost race ends synchronised, with the winner on the device', async () => {
  const { client, rows, control } = standIn()
  const a = device('sync-race', client)
  a.consent.set('confirmed')
  const created = await a.store.createEntry(CODEX, draft({ rating: 5 }))
  await a.sync.sessionChanged(true)
  assert.equal(rows.length, 1)
  await tick()
  await a.store.updateEntry(created.id, { rating: 6 })

  // Between this device's pull and its write, another device writes later.
  control.before = (method) => {
    if (method !== 'PATCH') return
    control.before = undefined
    rows[0].updated_at = serverTime(later(60_000))
    payloadOf(rows[0]).rating = 8
  }
  const revision = a.sync.getState().revision
  await a.sync.request()
  const state = a.sync.getState()
  assert.equal(state.phase, 'idle')
  assert.deepEqual([...(state.pending ?? ['unknown'])], [])
  assert.ok(state.revision > revision)
  assert.equal((await a.store.getEntry(created.id))?.rating, 8)
  await a.store.close()
})

test('a write that landed but whose response was lost is not an error when it is sent again', async () => {
  const { client, rows, control, requests } = standIn()
  const a = device('sync-lost-response', client)
  a.consent.set('confirmed')
  const created = await a.store.createEntry(CODEX, draft({ rating: 5 }))
  await a.sync.sessionChanged(true)
  await tick()
  const edited = await a.store.updateEntry(created.id, { rating: 6 })

  // At the wire: the second sending of the same write reads back nothing.
  control.loseResponse.add('PATCH')
  await assert.rejects(push(client, { insert: [], update: [edited] }))
  assert.equal(payloadOf(rows[0]).rating, 6)
  assert.deepEqual((await push(client, { insert: [], update: [edited] })).superseded, [created.id])

  // Through the reconciler: the run that lost the response fails, the next
  // finds the write already there and ends synchronised.
  await tick()
  await a.store.updateEntry(created.id, { rating: 7 })
  control.loseResponse.add('PATCH')
  await a.sync.request()
  assert.equal(a.sync.getState().phase, 'failed')
  assert.ok(a.sync.getState().pending?.has(created.id))
  assert.equal(payloadOf(rows[0]).rating, 7)
  requests.length = 0
  await a.sync.request()
  assert.equal(a.sync.getState().phase, 'idle')
  assert.equal(a.sync.getState().pending?.size, 0)
  assert.deepEqual(methodsOf(requests), ['GET'])
  await a.store.close()
})

test('a tombstone travels in both directions, and the seam\'s own reads still do not return one', async () => {
  const { client, rows } = standIn()
  const a = device('sync-travel-a', client)
  const b = device('sync-travel-b', client)
  a.consent.set('confirmed')
  b.consent.set('confirmed')
  const one = await a.store.createEntry(CODEX, draft())
  const two = await a.store.createEntry(CODEX, draft())
  await a.sync.sessionChanged(true)
  await b.sync.sessionChanged(true)
  assert.equal((await b.store.exportEntries()).length, 2)

  // From a, through the server, to b.
  await tick()
  await a.store.deleteEntry(one.id)
  await a.sync.request()
  const [aTomb] = (await a.store.readRecords(CODEX)).filter((e) => e.id === one.id)
  assert.ok(aTomb.deletedAt)
  assert.equal(Date.parse(rows.find((r) => r.id === one.id)?.deleted_at as string), Date.parse(aTomb.deletedAt))
  await b.sync.request()
  assert.deepEqual((await b.store.readRecords(CODEX)).find((e) => e.id === one.id), aTomb)
  assert.equal(await b.store.getEntry(one.id), undefined)
  assert.deepEqual((await b.store.exportEntries()).map((e) => e.id), [two.id])
  assert.deepEqual((await b.store.listEntries(CODEX, { limit: 10 })).entries.map((e) => e.id), [two.id])

  // From b, through the server, to a.
  await tick()
  await b.store.deleteEntry(two.id)
  await b.sync.request()
  await a.sync.request()
  assert.ok((await a.store.readRecords(CODEX)).find((e) => e.id === two.id)?.deletedAt)
  assert.equal(await a.store.getEntry(two.id), undefined)
  assert.deepEqual(await a.store.exportEntries(), [])
  assert.deepEqual((await a.store.listEntries(CODEX, { limit: 10 })).entries, [])
  assert.ok(rows.every((r) => r.deleted_at !== null))
  await a.store.close()
  await b.store.close()
})

test('the strict comparison resolves equal updatedAt to the existing row and greater to the writer, in both directions', async () => {
  const base = { ...draft(), codex: CODEX, schemaVersion: 1, updatedAt: '2026-11-26T10:00:00.000Z' } as Entry
  const equal = { ...base, rating: 1 }
  const greater = { ...base, rating: 2, updatedAt: '2026-11-26T10:00:00.001Z' }

  // The comparison.
  assert.deepEqual(plan([base], [equal]), { apply: [], insert: [], update: [] })
  assert.deepEqual(plan([greater], [base]), { apply: [], insert: [], update: [greater] })
  assert.deepEqual(plan([base], [greater]), { apply: [greater], insert: [], update: [] })

  // Onto the device: equal leaves the device's record, greater replaces it.
  const store = new LocalEntryStore({ name: 'sync-strict' })
  assert.deepEqual(await store.applyRecords([base]), [base.id])
  assert.deepEqual(await store.applyRecords([equal]), [])
  assert.equal((await store.getEntry(base.id))?.rating, base.rating)
  assert.deepEqual(await store.applyRecords([greater]), [base.id])
  assert.equal((await store.getEntry(base.id))?.rating, 2)
  await store.close()

  // Onto the server: equal leaves the server's row, greater replaces it.
  const { client, rows } = standIn()
  await push(client, { insert: [base], update: [] })
  assert.deepEqual((await push(client, { insert: [], update: [equal] })).superseded, [base.id])
  assert.equal(payloadOf(rows[0]).rating, base.rating)
  assert.deepEqual((await push(client, { insert: [], update: [greater] })).superseded, [])
  assert.equal(payloadOf(rows[0]).rating, 2)
})

test('two updates to one entry inside a millisecond, each pushed: the second reaches the server and is not superseded', async (t) => {
  // The clock held still; only Date is replaced.
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-26T10:00:00.000Z') })
  const { client, rows, requests } = standIn()
  const a = device('sync-held-clock', client)
  a.consent.set('confirmed')
  const created = await a.store.createEntry(CODEX, draft({ rating: 5 }))
  await a.sync.sessionChanged(true)
  assert.equal(rows.length, 1)

  await a.store.updateEntry(created.id, { rating: 6 })
  await a.sync.request()
  assert.equal(payloadOf(rows[0]).rating, 6)

  const second = await a.store.updateEntry(created.id, { rating: 7 })
  requests.length = 0
  await a.sync.request()
  assert.deepEqual(methodsOf(requests), ['GET', 'PATCH'])
  assert.deepEqual(requests[1].response, [{ id: created.id }])
  assert.equal(payloadOf(rows[0]).rating, 7)
  assert.equal(Date.parse(rows[0].updated_at as string), Date.parse(second.updatedAt))
  assert.equal(a.sync.getState().phase, 'idle')
  assert.equal(a.sync.getState().pending?.size, 0)
  await a.store.close()
})

test('no push is attempted at an origin whose confirmation has not been given, and one is attempted the moment it has', async () => {
  const { client, rows, requests } = standIn()
  const a = device('sync-gate-accept', client)
  for (let i = 0; i < 3; i++) await a.store.createEntry(CODEX, draft())
  await a.sync.sessionChanged(true)
  assert.deepEqual(a.sync.getState().question, { count: 3 })
  await a.sync.request()
  assert.deepEqual(methodsOf(requests), ['GET', 'GET'])
  assert.equal(rows.length, 0)
  assert.equal(a.consent.get(), undefined)
  assert.equal(a.sync.getState().pending?.size, 3)

  requests.length = 0
  await a.sync.confirm()
  assert.deepEqual(methodsOf(requests), ['GET', 'POST'])
  assert.equal(rows.length, 3)
  assert.equal(a.consent.get(), 'confirmed')
  assert.equal(a.sync.getState().question, undefined)
  assert.equal(a.sync.getState().pending?.size, 0)
  await a.store.close()
})

test('a declined confirmation withholds the push and leaves the local record intact', async () => {
  const { client, rows, requests } = standIn()
  const storage = memoryStorage()
  const a = device('sync-gate-decline', client, storage)
  const made: Entry[] = []
  for (let i = 0; i < 3; i++) made.push(await a.store.createEntry(CODEX, draft()))
  await a.store.deleteEntry(made[2].id)
  await a.sync.sessionChanged(true)
  assert.deepEqual(a.sync.getState().question, { count: 2 })
  const before = await a.store.readRecords(CODEX)

  a.sync.decline()
  await a.sync.request()
  await a.sync.request()
  assert.ok(methodsOf(requests).every((m) => m === 'GET'))
  assert.equal(rows.length, 0)
  assert.equal(a.sync.getState().question, undefined)
  assert.equal(a.sync.getState().pending?.size, 3)
  assert.deepEqual(await a.store.readRecords(CODEX), before)
  assert.equal((await a.store.exportEntries()).length, 2)

  // A reload in the same session does not ask again.
  const reloaded = new Synchroniser(client, a.store, storedConsent(() => storage))
  await reloaded.sessionChanged(true)
  assert.equal(reloaded.getState().question, undefined)
  assert.equal(rows.length, 0)

  // The question returns at the next sign-in.
  await reloaded.sessionChanged(false)
  await reloaded.sessionChanged(true)
  assert.deepEqual(reloaded.getState().question, { count: 2 })
  assert.equal(rows.length, 0)
  assert.ok(methodsOf(requests).every((m) => m === 'GET'))
  await a.store.close()
})

test('a second confirmation at an origin whose entries are already on the server pushes nothing', async () => {
  const { client, rows, requests } = standIn()
  const a = device('sync-gate-second', client)
  for (let i = 0; i < 2; i++) await a.store.createEntry(CODEX, draft())
  await a.sync.sessionChanged(true)
  await a.sync.confirm()
  assert.equal(rows.length, 2)

  // The origin's answer is gone; its entries are on the server already.
  const again = new Synchroniser(client, a.store, storedConsent(() => memoryStorage()))
  requests.length = 0
  await again.sessionChanged(true)
  assert.deepEqual(again.getState().question, { count: 2 })
  await again.confirm()
  assert.equal(again.getState().phase, 'idle')
  assert.deepEqual(methodsOf(requests), ['GET', 'GET'])
  assert.equal(rows.length, 2)
  assert.equal(again.getState().pending?.size, 0)
  await a.store.close()
})

test('an origin holding nothing unattached is not asked, and what is written there afterwards is sent', async () => {
  const { client, rows } = standIn()
  const a = device('sync-gate-empty', client)
  await a.sync.sessionChanged(true)
  assert.equal(a.sync.getState().question, undefined)
  assert.equal(a.consent.get(), 'confirmed')
  await a.store.createEntry(CODEX, draft())
  await a.sync.request()
  assert.equal(rows.length, 1)
  await a.store.close()
})

test('the reconciler pulls a multi-page record whole, each page below the ceiling', async () => {
  const { client, requests } = standIn()
  const seed = new LocalEntryStore({ name: 'sync-reconcile-pages-seed' })
  const entries: Entry[] = []
  for (let i = 0; i < 1201; i++) entries.push(await seed.createEntry(CODEX, draft()))
  await push(client, { insert: entries, update: [] })
  await seed.close()

  const b = device('sync-reconcile-pages', client)
  requests.length = 0
  await b.sync.sessionChanged(true)
  const held = await b.store.readRecords(CODEX)
  assert.equal(held.length, 1201)
  assert.deepEqual(held.map((e) => e.id), entries.map((e) => e.id).sort())
  assert.deepEqual(methodsOf(requests), ['GET', 'GET', 'GET'])
  for (const req of requests) assert.ok(Number(req.url.searchParams.get('limit')) < DATA_API_MAX_ROWS)
  assert.equal(b.sync.getState().pending?.size, 0)
  await b.store.close()
})

test('the composite store is the one selected; each write through it, and no read, starts a synchronisation', async () => {
  assert.equal(entryStore, syncedStore)
  assert.ok(syncedStore instanceof CompositeEntryStore)
  assert.ok(syncedStore.device instanceof LocalEntryStore)

  const { client, rows } = standIn()
  const local = new LocalEntryStore({ name: 'sync-composite' })
  const composite = new CompositeEntryStore(local)
  const sync = new Synchroniser(client, local, storedConsent(() => memoryStorage()))
  await sync.sessionChanged(true)
  let writes = 0
  composite.onWrite(() => writes++)
  composite.onWrite(() => {
    throw new Error('a listener that fails')
  })
  const sent: Promise<void>[] = []
  composite.onWrite(() => sent.push(sync.request()))

  // Writes a millisecond apart: two in the same millisecond carry equal
  // updatedAt, and the strict comparison sends only the first.
  const e = await composite.createEntry(CODEX, draft({ producer: 'Raveneau' }))
  await tick()
  await composite.updateEntry(e.id, { rating: 3 })
  assert.equal(writes, 2)
  await composite.listEntries(CODEX, { limit: 10 })
  await composite.getEntry(e.id)
  await composite.exportEntries()
  await composite.listDistinct('producer')
  assert.equal(writes, 2)
  await assert.rejects(composite.updateEntry(newEntryId(), { rating: 1 }))
  assert.equal(writes, 2)
  await Promise.all(sent)
  assert.equal(payloadOf(rows[0]).rating, 3)

  await tick()
  await composite.deleteEntry(e.id)
  assert.equal(writes, 3)
  await Promise.all(sent)
  assert.notEqual(rows[0].deleted_at, null)
  // The seam's reads are the local store's.
  assert.equal(await composite.getEntry(e.id), undefined)
  assert.deepEqual(await composite.exportEntries(), await local.exportEntries())
  assert.deepEqual(await composite.listDistinct('producer'), [])
  await local.close()
})

test('without a session nothing is sent; a failure leaves the record on the device and the next run recovers', async () => {
  const { client, rows, requests, control } = standIn()
  const a = device('sync-failure', client)
  a.consent.set('confirmed')
  const first = await a.store.createEntry(CODEX, draft())
  await a.sync.request()
  assert.equal(requests.length, 0)

  control.refuse.add('GET')
  await a.sync.sessionChanged(true)
  assert.equal(a.sync.getState().phase, 'failed')
  // No pull has succeeded, so there is nothing to compare against.
  assert.equal(a.sync.getState().pending, undefined)
  assert.equal((await a.store.exportEntries()).length, 1)

  control.refuse.delete('GET')
  await a.sync.request()
  assert.equal(a.sync.getState().phase, 'idle')
  assert.equal(rows.length, 1)

  control.refuse.add('POST')
  const second = await a.store.createEntry(CODEX, draft())
  await a.sync.request()
  assert.equal(a.sync.getState().phase, 'failed')
  assert.deepEqual([...(a.sync.getState().pending ?? [])], [second.id])
  assert.deepEqual((await a.store.exportEntries()).map((e) => e.id).sort(), [first.id, second.id].sort())
  control.refuse.delete('POST')
  await a.sync.request()
  assert.equal(a.sync.getState().phase, 'idle')
  assert.equal(rows.length, 2)
  await a.store.close()
})

test('the origin\'s answer: confirmed is kept, declined is cleared at sign-out, and refusing storage holds it in memory', () => {
  const storage = memoryStorage()
  const consent = storedConsent(() => storage)
  consent.set('declined')
  assert.equal(storedConsent(() => storage).get(), 'declined')
  consent.clearDecline()
  assert.equal(consent.get(), undefined)
  consent.set('confirmed')
  consent.clearDecline()
  assert.equal(storedConsent(() => storage).get(), 'confirmed')

  const refusing = storedConsent(() => {
    throw new Error('storage refused')
  })
  assert.equal(refusing.get(), undefined)
  refusing.set('confirmed')
  assert.equal(refusing.get(), 'confirmed')
})

test('across every request: codex is only ever vini, and nothing emits DELETE or TRUNCATE against either relation', () => {
  assert.equal(CODEX, 'vini')
  const methods = new Set(wire.map((r) => r.method))
  assert.deepEqual([...methods].sort(), ['GET', 'PATCH', 'POST'])
  for (const req of wire) {
    assert.ok(req.method !== 'DELETE', `DELETE ${req.url}`)
    assert.equal(req.url.pathname, '/rest/v1/entries')
    assert.doesNotMatch(`${req.url}${JSON.stringify(req.body ?? '')}`, /truncate|profiles/i)
    const codex = req.url.searchParams.get('codex')
    if (codex !== null) assert.equal(codex, 'eq.vini')
    const items = Array.isArray(req.body) ? req.body : req.body === undefined ? [] : [req.body]
    for (const item of items as Record<string, unknown>[]) {
      if ('codex' in item) assert.equal(item.codex, 'vini')
    }
  }
})
