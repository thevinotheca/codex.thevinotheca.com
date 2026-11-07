import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Entry } from '../src/entries/entry.ts'
import { filterEntries, NO_FILTERS } from '../src/book/filter.ts'
import { placesOf, type Places } from '../src/where/places.ts'

// Where you have been, over entries built in memory. Nothing here is written
// through the seam or placed in any store.

function entry(fields: Partial<Entry>, n = 0): Entry {
  return {
    id: `synthetic-${n}`,
    codex: 'synthetic',
    schemaVersion: 1,
    updatedAt: '2026-11-07T00:00:00.000Z',
    producer: 'Producer',
    wine: 'Wine',
    vintage: '2019',
    rating: 8,
    ...fields,
  }
}

function place(country?: string, region?: string): Partial<Entry> {
  return { country, region }
}

// Every country with its count, and its regions with theirs.
function shape(places: Places) {
  return places.countries.map((c) => [c.country, c.count, c.regions.map((r) => [r.region, r.count]), c.noRegion])
}

// The arithmetic closes: countries and the unplaced make the wines, and
// within a country its regions and its unrecorded make its count.
function assertCloses(places: Places) {
  assert.equal(places.countries.reduce((n, c) => n + c.count, 0) + places.unplaced, places.wines)
  for (const c of places.countries) {
    assert.equal(c.regions.reduce((n, r) => n + r.count, 0) + c.noRegion, c.count, c.country)
  }
  assert.equal(places.regions, places.countries.reduce((n, c) => n + c.regions.length, 0))
}

test('countries and their regions are ordered by count, ties alphabetically', () => {
  const places = placesOf([
    place('Italy', 'Piedmont'), place('Italy', 'Tuscany'), place('Italy', 'Piedmont'),
    place('France', 'Loire'), place('France', 'Burgundy'), place('France', 'Burgundy'),
    place('Austria', 'Wachau'), place('Spain', 'Rioja'), place('Spain', 'Rioja'),
    place('Spain', 'Priorat'),
  ].map((p, n) => entry(p, n)))
  assert.deepEqual(shape(places), [
    ['France', 3, [['Burgundy', 2], ['Loire', 1]], 0],
    ['Italy', 3, [['Piedmont', 2], ['Tuscany', 1]], 0],
    ['Spain', 3, [['Rioja', 2], ['Priorat', 1]], 0],
    ['Austria', 1, [['Wachau', 1]], 0],
  ])
  assert.equal(places.wines, 10)
  assert.equal(places.regions, 7)
  assert.equal(places.countries.length, 4)
  assert.equal(places.unplaced, 0)
  assertCloses(places)
})

test('wines with no region are counted under their country, with no country not placed', () => {
  const places = placesOf([
    place('France', 'Burgundy'), place('France'), place('France'),
    place('Italy'),
    place(), place(undefined, 'Mosel'), place(),
  ].map((p, n) => entry(p, n)))
  assert.deepEqual(shape(places), [
    ['France', 3, [['Burgundy', 1]], 2],
    ['Italy', 1, [], 1],
  ])
  assert.equal(places.wines, 7)
  assert.equal(places.regions, 1)
  assert.equal(places.countries.length, 2)
  // A region with no country falls in the unplaced, not under its region.
  assert.equal(places.unplaced, 3)
  assertCloses(places)
})

test('the stored pair is the key exactly: spellings and countries are not merged', () => {
  const places = placesOf([
    place('France', 'Burgundy'), place('France', 'Bourgogne'), place('france', 'Burgundy'),
    place('USA', 'Central Valley'), place('Chile', 'Central Valley'),
  ].map((p, n) => entry(p, n)))
  assert.deepEqual(shape(places), [
    ['France', 2, [['Bourgogne', 1], ['Burgundy', 1]], 0],
    ['Chile', 1, [['Central Valley', 1]], 0],
    ['france', 1, [['Burgundy', 1]], 0],
    ['USA', 1, [['Central Valley', 1]], 0],
  ])
  assert.equal(places.regions, 5)
  assert.equal(places.countries.length, 4)
  assertCloses(places)
})

test('an empty book has no places', () => {
  assert.deepEqual(placesOf([]), { wines: 0, regions: 0, countries: [], unplaced: 0 })
})

test('a region tapped narrows the Book to exactly its count', () => {
  const PLACES: [string | undefined, string | undefined][] = [
    ['France', 'Burgundy'], ['France', 'Loire'], ['France', undefined],
    ['Italy', 'Piedmont'], ['Italy', 'Tuscany'], [undefined, 'Burgundy'],
    ['USA', 'Central Valley'], ['Chile', 'Central Valley'], [undefined, undefined],
  ]
  const entries = Array.from({ length: 400 }, (_, n) => {
    const [country, region] = PLACES[(n * 7) % PLACES.length]
    return entry(place(country, region), n)
  })
  const places = placesOf(entries)
  assertCloses(places)
  for (const c of places.countries) {
    for (const r of c.regions) {
      const shown = filterEntries(entries, { ...NO_FILTERS, country: c.country, region: r.region })
      assert.equal(shown.length, r.count, `${c.country} / ${r.region}`)
    }
  }
})
