import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openDB } from 'idb'
import { createClient } from '@supabase/supabase-js'
import { CODEX, newEntryId, type Entry, type EntryDraft } from '../src/entries/index.ts'
import { LocalEntryStore } from '../src/entries/local.ts'
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
  throw new Error(`unexpected operator ${op}`)
}

function standIn() {
  // Held in insertion order, as a heap holds them; only an order clause sorts.
  const rows: Record<string, unknown>[] = []
  const requests: Sent[] = []

  function handle(method: string, url: URL, body: unknown): { status: number; body?: unknown } {
    // A client that does not stop is refused, so a runaway pull fails its
    // case rather than the run.
    if (requests.length >= MAX_REQUESTS) return { status: 429, body: { message: 'too many requests' } }
    if (url.pathname !== '/rest/v1/entries') return { status: 404 }
    const params = url.searchParams
    const allowed: Record<string, string[]> = {
      GET: ['select', 'codex', 'id', 'order', 'limit'],
      POST: ['columns'],
      PATCH: ['id'],
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
      const select = params.get('select') ?? '*'
      if (select !== '*') {
        const columns = select.split(',')
        out = out.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])))
      }
      return { status: 200, body: out }
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
    for (const row of rows.filter((r) => matches(r, 'id', params.get('id')))) {
      Object.assign(row, patch, {
        updated_at: serverTime(patch.updated_at),
        deleted_at: patch.deleted_at === null ? null : serverTime(patch.deleted_at),
      })
    }
    return { status: 204 }
  }

  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = (init.method ?? 'GET').toUpperCase()
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    const result = handle(method, url, body)
    const sent = { method, url, body, response: result.body }
    requests.push(sent)
    wire.push(sent)
    return reply(result.status, result.body)
  }

  const client: Backend = createClient<Database>('https://stand-in.test', 'stand-in-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  })
  return { client, rows, requests }
}

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
