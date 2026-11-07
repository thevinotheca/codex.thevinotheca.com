import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Entry } from '../src/entries/entry.ts'
import { filterEntries, NO_FILTERS, optionsOf, sortEntries } from '../src/book/filter.ts'

// The Book's filter panel, over entries built in memory. Nothing here is
// written through the seam or placed in any store.

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

const PLACES: [string, string][] = [
  ['France', 'Burgundy'], ['France', 'Bordeaux'], ['France', 'Loire'],
  ['Italy', 'Piedmont'], ['Italy', 'Tuscany'], ['Spain', 'Rioja'],
  ['Germany', 'Mosel'], ['Austria', 'Wachau'], ['Portugal', 'Douro'],
]
const GRAPES: [string, string][] = [
  ['Pinot Noir', 'red'], ['Chardonnay', 'white'], ['Nebbiolo', 'red'],
  ['Riesling', 'white'], ['Tempranillo', 'red'], ['Grüner Veltliner', 'white'],
  ['Champagne Blend', 'sparkling'], ['Grenache', 'rosé'],
]

// A few hundred entries, varied in every field the panel reads.
function synthetic(count: number): Entry[] {
  return Array.from({ length: count }, (_, n) => {
    const [country, region] = PLACES[n % PLACES.length]
    const [grape, colour] = GRAPES[n % GRAPES.length]
    return entry({
      producer: `Producer ${n % 97}`,
      wine: `Cuvée ${n}`,
      vintage: String(1990 + (n % 35)),
      rating: (n * 37 % 101) / 10,
      grape,
      colour,
      country,
      region,
      dateTasted: `20${10 + (n % 16)}-0${1 + (n % 9)}-1${n % 10}`,
    }, n)
  })
}

test('search reaches producer, wine, region, country and grape, ignoring case', () => {
  const entries = [
    entry({ producer: 'Domaine Leflaive' }, 1),
    entry({ wine: 'Clos de Bèze' }, 2),
    entry({ region: 'Mosel' }, 3),
    entry({ country: 'Austria' }, 4),
    entry({ grape: 'Grüner Veltliner' }, 5),
    entry({ vintage: '2015' }, 6),
  ]
  const ids = (search: string) => filterEntries(entries, { ...NO_FILTERS, search }).map((e) => e.id)
  assert.deepEqual(ids('leflaive'), ['synthetic-1'])
  assert.deepEqual(ids(' BÈZE '), ['synthetic-2'])
  assert.deepEqual(ids('mos'), ['synthetic-3'])
  assert.deepEqual(ids('austria'), ['synthetic-4'])
  assert.deepEqual(ids('grüner'), ['synthetic-5'])
  assert.deepEqual(ids('2015'), [])
  assert.equal(ids('').length, entries.length)
})

test('options come from the member\'s own values, and a country narrows regions', () => {
  const entries = [
    entry({ country: 'France', region: 'Burgundy', grape: 'Pinot Noir', colour: 'red', rating: 9.2 }, 1),
    entry({ country: 'France', region: 'Loire', rating: 7.9 }, 2),
    entry({ country: 'Italy', region: 'Piedmont', rating: 9.0 }, 3),
    entry({ rating: 6.5 }, 4),
  ]
  const all = optionsOf(entries, '')
  assert.deepEqual(all.country, ['France', 'Italy'])
  assert.deepEqual(all.region, ['Burgundy', 'Loire', 'Piedmont'])
  assert.deepEqual(all.grape, ['Pinot Noir'])
  assert.deepEqual(all.colour, ['red'])
  assert.deepEqual(all.rating, ['9', '7', '6'])
  assert.deepEqual(optionsOf(entries, 'France').region, ['Burgundy', 'Loire'])
  assert.deepEqual(optionsOf(entries, 'Italy').region, ['Piedmont'])
  assert.deepEqual(optionsOf([], '').country, [])
})

test('every control narrows, and the sort orders what remains', () => {
  const entries = synthetic(400)
  const f = { ...NO_FILTERS, country: 'France', colour: 'red', rating: '5' }
  const shown = filterEntries(entries, f)
  assert.ok(shown.length > 0 && shown.length < entries.length)
  assert.ok(shown.every((e) => e.country === 'France' && e.colour === 'red' && e.rating >= 5))
  assert.equal(filterEntries(entries, { ...f, region: 'Rioja' }).length, 0)

  const down = sortEntries(shown, 'rating-desc')
  const up = sortEntries(shown, 'rating-asc')
  for (let i = 1; i < down.length; i++) {
    assert.ok(down[i - 1].rating >= down[i].rating)
    assert.ok(up[i - 1].rating <= up[i].rating)
  }
  assert.equal(filterEntries(entries, NO_FILTERS).length, entries.length)
})

test('equal ratings break by date tasted, most recent first, undated last', () => {
  const entries = [
    entry({ rating: 8, dateTasted: '2024-01-01' }, 1),
    entry({ rating: 8 }, 2),
    entry({ rating: 8, dateTasted: '2026-01-01' }, 3),
    entry({ rating: 9 }, 4),
  ]
  assert.deepEqual(sortEntries(entries, 'rating-desc').map((e) => e.id),
    ['synthetic-4', 'synthetic-3', 'synthetic-1', 'synthetic-2'])
  assert.deepEqual(sortEntries(entries, 'rating-asc').map((e) => e.id),
    ['synthetic-3', 'synthetic-1', 'synthetic-2', 'synthetic-4'])
})

test('a few hundred entries filter and sort within a frame', () => {
  const entries = synthetic(400)
  const passes = [
    NO_FILTERS,
    { ...NO_FILTERS, search: 'cuvée 1' },
    { ...NO_FILTERS, country: 'Italy', region: 'Tuscany' },
    { ...NO_FILTERS, grape: 'Riesling', rating: '7', sort: 'rating-asc' as const },
  ]
  const times: number[] = []
  for (let round = 0; round < 25; round++) {
    for (const f of passes) {
      const start = performance.now()
      optionsOf(entries, f.country)
      sortEntries(filterEntries(entries, f), f.sort)
      times.push(performance.now() - start)
    }
  }
  times.sort((a, b) => a - b)
  const median = times[Math.floor(times.length / 2)]
  const worst = times[times.length - 1]
  assert.ok(median < 16, `median ${median.toFixed(2)} ms`)
  assert.ok(worst < 50, `worst ${worst.toFixed(2)} ms`)
})
