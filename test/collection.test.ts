import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { Entry } from '../src/entries/entry.ts'
import {
  collectionOf,
  ENTRIES,
  meanOf,
  noticeOf,
  WIDTH,
  worldsOf,
  type Collection,
  type Count,
  type Mean,
} from '../src/collection/views.ts'

// The Collection's notices and arithmetic, over entries built in memory and
// the carried classifications as they stand. Nothing here is written through
// the seam or placed in any store, and nothing here draws a chart.

const WORLDS = worldsOf(
  JSON.parse(readFileSync(new URL('../src/reference/region-classifications.json', import.meta.url), 'utf8')),
)

function entry(fields: Partial<Entry>, n = 0): Entry {
  return {
    id: `synthetic-${n}`,
    codex: 'synthetic',
    schemaVersion: 1,
    updatedAt: '2026-11-08T00:00:00.000Z',
    producer: 'Producer',
    wine: 'Wine',
    vintage: '2019',
    rating: 8,
    ...fields,
  }
}

const sum = (bars: { count: number }[]) => bars.reduce((n, b) => n + b.count, 0)

// A count closes when its groups and its unnamed make the wines.
function assertCountCloses(count: Count, wines: number, what: string) {
  assert.equal(sum(count.bars) + count.unnamed, wines, what)
}

// A mean closes when its drawn bars, its categories of one and its unnamed
// make the wines.
function assertMeanCloses(mean: Mean, wines: number, what: string) {
  assert.equal(sum(mean.bars) + mean.single.length + mean.unnamed, wines, what)
}

function assertCloses(c: Collection) {
  for (const k of ['ratings', 'colours', 'vintages', 'countries', 'regions', 'grapes'] as const) {
    assertCountCloses(c[k], c.wines, k)
  }
  assertMeanCloses(c.byCountry, c.wines, 'byCountry')
  assertMeanCloses(c.byGrape, c.wines, 'byGrape')
}

test('the thresholds are the record\'s: 1100 wide and ten entries', () => {
  assert.equal(WIDTH, 1100)
  assert.equal(ENTRIES, 10)
})

test('below the width the width notice is selected, whatever the record holds', () => {
  for (const entries of [0, 9, 10, 400]) {
    assert.equal(noticeOf(WIDTH - 1, entries), 'width', `${entries} entries`)
  }
})

test('at or above the width a sparse record selects the entry notice, and ten selects none', () => {
  for (const width of [WIDTH, 1440]) {
    assert.equal(noticeOf(width, 0), 'entries')
    assert.equal(noticeOf(width, ENTRIES - 1), 'entries')
    assert.equal(noticeOf(width, ENTRIES), undefined)
  }
})

test('below both thresholds the width alone is stated', () => {
  assert.equal(noticeOf(390, 3), 'width')
  assert.equal(noticeOf(WIDTH - 1, ENTRIES - 1), 'width')
})

test('a mean over a category of one entry is stated and not drawn', () => {
  const mean = meanOf([
    entry({ country: 'Greece', rating: 9.5 }, 0),
    entry({ country: 'Italy', rating: 8 }, 1),
    entry({ country: 'Italy', rating: 9 }, 2),
  ], 'country')
  assert.deepEqual(mean.bars.map((b) => b.label), ['Italy'])
  assert.deepEqual(mean.single, ['Greece'])
  assertMeanCloses(mean, 3, 'country')
})

test('a mean over a category of two is drawn with its count, and is the plain mean', () => {
  // Two wines at 6.0 and 7.0 against a grand mean far above them: a shrunk
  // mean would be pulled toward it, the plain mean is 6.5.
  const mean = meanOf([
    entry({ grape: 'Gamay', rating: 6 }, 0),
    entry({ grape: 'Gamay', rating: 7 }, 1),
    entry({ grape: 'Nebbiolo', rating: 10 }, 2),
    entry({ grape: 'Nebbiolo', rating: 10 }, 3),
    entry({ grape: 'Nebbiolo', rating: 10 }, 4),
  ], 'grape')
  assert.deepEqual(mean.bars, [
    { label: 'Nebbiolo', count: 3, mean: 10 },
    { label: 'Gamay', count: 2, mean: 6.5 },
  ])
  assert.deepEqual(mean.single, [])
})

test('the arithmetic closes when entries carry no country and no grape', () => {
  const c = collectionOf([
    entry({ country: 'France', region: 'Burgundy', grape: 'Pinot Noir', colour: 'red', rating: 9.2 }, 0),
    entry({ country: 'France', region: 'Burgundy', grape: 'Pinot Noir', colour: 'red', rating: 8.8 }, 1),
    entry({ country: 'France', grape: 'Chardonnay', colour: 'white', vintage: 'NV' }, 2),
    entry({ country: 'Italy', region: 'Piedmont' }, 3),
    entry({ grape: 'Riesling', colour: 'white' }, 4),
    entry({}, 5),
    entry({ region: 'Mosel' }, 6),
  ])
  assert.equal(c.wines, 7)
  assert.deepEqual(c.countries, { bars: [{ label: 'France', count: 3 }, { label: 'Italy', count: 1 }], unnamed: 3 })
  assert.deepEqual(c.grapes.unnamed, 3)
  assert.deepEqual(c.byCountry.bars.map((b) => [b.label, b.count]), [['France', 3]])
  assert.deepEqual(c.byCountry.single, ['Italy'])
  assert.equal(c.byCountry.unnamed, 3)
  assert.deepEqual(c.byGrape.bars.map((b) => [b.label, b.count, b.mean]), [['Pinot Noir', 2, 9]])
  assert.deepEqual(c.byGrape.single, ['Chardonnay', 'Riesling'])
  assert.equal(c.byGrape.unnamed, 3)
  assertCloses(c)
})

test('the counts have no floor: a group of one is drawn', () => {
  const c = collectionOf([entry({ country: 'Greece', grape: 'Assyrtiko', region: 'Santorini', colour: 'white' })])
  for (const k of ['countries', 'regions', 'grapes', 'colours'] as const) {
    assert.deepEqual(c[k].bars.map((b) => b.count), [1], k)
  }
})

test('ratings run highest first, vintages earliest first with NV last', () => {
  const c = collectionOf(
    [['2015', 8.5], ['NV', 9], ['2009', 8.5], ['2015', 10], ['1998', 7.1]].map(([vintage, rating], n) =>
      entry({ vintage: vintage as string, rating: rating as number }, n)),
  )
  assert.deepEqual(c.ratings.bars.map((b) => [b.label, b.count]), [['10.0', 1], ['9.0', 1], ['8.5', 2], ['7.1', 1]])
  assert.deepEqual(c.vintages.bars.map((b) => b.label), ['1998', '2009', '2015', 'NV'])
  assertCloses(c)
})

test('groups are the stored value exactly: spellings are not merged', () => {
  const c = collectionOf(['France', 'france', 'France '].map((country, n) => entry({ country }, n)))
  assert.equal(c.countries.bars.length, 3)
  assertCloses(c)
})

test('the colour view reads the stored colour, not the grape', () => {
  const c = collectionOf([
    entry({ grape: 'Pinot Noir', colour: 'rosé' }, 0),
    entry({ grape: 'Pinot Noir' }, 1),
  ])
  assert.deepEqual(c.colours, { bars: [{ label: 'rosé', count: 1 }], unnamed: 1 })
})

test('the classifications are the carried file less its _source key, joined exactly', () => {
  assert.equal(WORLDS.has('_source'), false)
  assert.equal(WORLDS.get('Napa Valley'), 'New World')
  assert.equal(WORLDS.get('Burgundy'), 'Old World')
  assert.equal(WORLDS.get('napa valley'), undefined)
  assert.equal(WORLDS.get('Santorini'), undefined)
})
