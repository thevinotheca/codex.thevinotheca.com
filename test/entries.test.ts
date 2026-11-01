import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openDB } from 'idb'
import { newEntryId, SCHEMA_VERSION, type EntryDraft } from '../src/entries/entry.ts'
import { LocalEntryStore } from '../src/entries/local.ts'

// The harness for the seam's local implementation, run against an in-memory
// IndexedDB. "Reload" closes the connection and opens a new store on the same
// database.

const CODEX = 'test-codex'

function draft(fields: Partial<EntryDraft> = {}): EntryDraft {
  return {
    id: newEntryId(),
    producer: 'Domaine Leflaive',
    wine: 'Puligny-Montrachet',
    vintage: '2019',
    rating: 8.5,
    ...fields,
  }
}

async function raw(name: string) {
  const db = await openDB(name)
  const records = await db.getAll('entries')
  const geocode = await db.count('geocode')
  db.close()
  return { records, geocode }
}

test('createEntry and getEntry', async () => {
  const store = new LocalEntryStore({ name: 'create' })
  const d = draft({ grape: 'Chardonnay', colour: 'White', dateTasted: '2026-10-31' })
  const created = await store.createEntry(CODEX, d)
  assert.equal(created.id, d.id)
  assert.equal(created.codex, CODEX)
  assert.equal(created.schemaVersion, SCHEMA_VERSION)
  assert.ok(!Number.isNaN(Date.parse(created.updatedAt)))
  assert.equal(created.deletedAt, undefined)
  assert.deepEqual(await store.getEntry(d.id), created)
  assert.equal(await store.getEntry('missing'), undefined)
  await assert.rejects(store.createEntry(CODEX, d))
  await store.close()
})

test('createEntry validates', async () => {
  const store = new LocalEntryStore({ name: 'validate' })
  await assert.rejects(store.createEntry(CODEX, draft({ producer: '' })), /producer/)
  await assert.rejects(store.createEntry(CODEX, draft({ vintage: '19' })), /vintage/)
  await assert.rejects(store.createEntry(CODEX, draft({ vintage: 'nv' })), /vintage/)
  await assert.rejects(store.createEntry(CODEX, draft({ rating: 10.1 })), /rating/)
  await assert.rejects(store.createEntry(CODEX, draft({ rating: -0.1 })), /rating/)
  await assert.rejects(store.createEntry(CODEX, draft({ rating: 8.55 })), /rating/)
  await store.createEntry(CODEX, draft({ vintage: 'NV', rating: 0 }))
  await store.createEntry(CODEX, draft({ rating: 10 }))
  assert.equal((await store.exportEntries()).length, 2)
  await store.close()
})

test('listEntries pages within one codex', async () => {
  const store = new LocalEntryStore({ name: 'list' })
  const ids: string[] = []
  for (let i = 0; i < 5; i++) ids.push((await store.createEntry(CODEX, draft())).id)
  await store.createEntry('other-codex', draft())
  await store.deleteEntry(ids[2])

  const seen: string[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const page = await store.listEntries(CODEX, { limit: 2, cursor })
    assert.ok(page.entries.length <= 2)
    seen.push(...page.entries.map((e) => e.id))
    cursor = page.nextCursor
    pages++
  } while (cursor)
  assert.equal(pages, 2)
  assert.deepEqual(seen.sort(), ids.filter((id) => id !== ids[2]).sort())

  const all = await store.listEntries(CODEX, { limit: 100 })
  assert.equal(all.entries.length, 4)
  assert.equal(all.nextCursor, undefined)
  await assert.rejects(store.listEntries(CODEX, { limit: 0 }), /limit/)
  await store.close()
})

test('updateEntry patches and sets updatedAt', async () => {
  const store = new LocalEntryStore({ name: 'update' })
  const created = await store.createEntry(CODEX, draft())
  const updated = await store.updateEntry(created.id, { rating: 9, region: 'Burgundy' })
  assert.equal(updated.rating, 9)
  assert.equal(updated.region, 'Burgundy')
  assert.equal(updated.producer, created.producer)
  assert.ok(updated.updatedAt >= created.updatedAt)
  assert.deepEqual(await store.getEntry(created.id), updated)
  await assert.rejects(store.updateEntry(created.id, { vintage: 'old' }), /vintage/)
  await assert.rejects(store.updateEntry('missing', { rating: 1 }))
  await store.close()
})

test('exportEntries and listDistinct', async () => {
  const store = new LocalEntryStore({ name: 'distinct' })
  await store.createEntry(CODEX, draft({ grape: 'Pinot Noir', country: 'France' }))
  await store.createEntry(CODEX, draft({ grape: 'Chardonnay', country: 'France' }))
  await store.createEntry('other-codex', draft({ producer: 'Bodegas Muga', country: 'Spain' }))
  const gone = await store.createEntry(CODEX, draft({ grape: 'Nebbiolo', region: 'Barolo' }))
  await store.deleteEntry(gone.id)

  assert.equal((await store.exportEntries()).length, 3)
  assert.deepEqual(await store.listDistinct('grape'), ['Chardonnay', 'Pinot Noir'])
  assert.deepEqual(await store.listDistinct('country'), ['France', 'Spain'])
  assert.deepEqual(await store.listDistinct('producer'), ['Bodegas Muga', 'Domaine Leflaive'])
  assert.deepEqual(await store.listDistinct('region'), [])
  await store.close()
})

test('tombstone round trip: delete, reload, it does not return', async () => {
  const name = 'tombstone'
  const before = new LocalEntryStore({ name })
  const kept = await before.createEntry(CODEX, draft({ grape: 'Chardonnay' }))
  const gone = await before.createEntry(CODEX, draft({ grape: 'Syrah' }))
  await before.deleteEntry(gone.id)
  await before.close()

  const after = new LocalEntryStore({ name })
  assert.equal(await after.getEntry(gone.id), undefined)
  assert.deepEqual(
    (await after.listEntries(CODEX, { limit: 10 })).entries.map((e) => e.id),
    [kept.id],
  )
  assert.deepEqual((await after.exportEntries()).map((e) => e.id), [kept.id])
  assert.deepEqual(await after.listDistinct('grape'), ['Chardonnay'])
  await assert.rejects(after.updateEntry(gone.id, { rating: 1 }))
  await assert.rejects(after.deleteEntry(gone.id))
  await after.close()

  // The tombstone is kept, not purged.
  const { records } = await raw(name)
  const tombstone = records.find((r) => r.id === gone.id)
  assert.ok(tombstone)
  assert.ok(!Number.isNaN(Date.parse(tombstone.deletedAt)))
})

test('schema-version migration is performed in place', async () => {
  const name = 'migration'
  const v1 = new LocalEntryStore({ name })
  const live = await v1.createEntry(CODEX, draft({ country: 'france' }))
  const gone = await v1.createEntry(CODEX, draft({ country: 'italy' }))
  await v1.deleteEntry(gone.id)
  await v1.close()

  // A synthetic version 2, standing in for the first real migration.
  const migrations = {
    1: (r: Record<string, unknown>) => ({
      ...r,
      country: typeof r.country === 'string' ? r.country.toUpperCase() : r.country,
    }),
  }
  assert.throws(() => new LocalEntryStore({ name, schemaVersion: 3, migrations }), /2/)

  const v2 = new LocalEntryStore({ name, schemaVersion: 2, migrations })
  const migrated = await v2.getEntry(live.id)
  assert.equal(migrated?.schemaVersion, 2)
  assert.equal(migrated?.country, 'FRANCE')
  assert.equal(migrated?.updatedAt, live.updatedAt)
  const created = await v2.createEntry(CODEX, draft())
  assert.equal(created.schemaVersion, 2)
  await v2.close()

  // Every stored record was rewritten, the tombstone included.
  const { records } = await raw(name)
  assert.equal(records.length, 3)
  assert.ok(records.every((r) => r.schemaVersion === 2))
  const tombstone = records.find((r) => r.id === gone.id)
  assert.equal(tombstone?.country, 'ITALY')
  assert.ok(tombstone?.deletedAt)
})

test('geocoding cache is created empty', async () => {
  const name = 'geocode'
  const store = new LocalEntryStore({ name })
  await store.exportEntries()
  await store.close()
  assert.equal((await raw(name)).geocode, 0)
})
