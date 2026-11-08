import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { Entry } from '../src/entries/entry.ts'
import { atlasOf, lookupOf, unplacedLine } from '../src/atlas/pins.ts'

// The Atlas's resolution and counting, over entries built in memory and the
// carried lookup as it stands. Nothing here is written through the seam or
// placed in any store, and nothing here draws a map.
//
// The colour resolver is a stand-in: grapes.ts imports its catalogue without
// an import attribute, which Node refuses. What is tested is that the
// Atlas passes the grape through and keeps a pin whose grape resolves to
// nothing.

const LOOKUP = lookupOf(
  JSON.parse(readFileSync(new URL('../src/reference/regions.json', import.meta.url), 'utf8')),
)

const COLOURS = new Map<string, string>([['Cabernet Sauvignon', 'red'], ['Assyrtiko', 'white']])
const colourOf = (grape: string) => COLOURS.get(grape)

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

test('a region the lookup holds is placed at its coordinate, sized and coloured', () => {
  const atlas = atlasOf([entry({ region: 'Napa Valley', grape: 'Cabernet Sauvignon', rating: 9 })], LOOKUP, colourOf)
  assert.deepEqual(atlas.pins, [{ id: 'synthetic-0', lat: 38.5, lng: -122.42, rating: 9, colour: 'red' }])
  assert.equal(atlas.unplaced, 0)
  assert.equal(unplacedLine(atlas), undefined)
})

test('the join is exact: no spelling, case or space is resolved', () => {
  const atlas = atlasOf(
    ['napa valley', 'Napa Valley ', ' Napa Valley', 'Napa  Valley', 'Napa Valley', 'Napa', '_source']
      .map((region, n) => entry({ region }, n)),
    LOOKUP,
    colourOf,
  )
  assert.deepEqual(atlas.pins, [])
  assert.equal(atlas.unplaced, 7)
})

test('a region absent from the lookup is unplaced, and the line reads the remainder', () => {
  const atlas = atlasOf([
    entry({ region: 'Napa Valley', grape: 'Cabernet Sauvignon' }, 0),
    entry({ region: 'Santorini', grape: 'Assyrtiko' }, 1),
  ], LOOKUP, colourOf)
  assert.deepEqual(atlas.pins.map((p) => p.id), ['synthetic-0'])
  assert.equal(atlas.unplaced, 1)
  assert.equal(unplacedLine(atlas), '1 wine not placed')
})

test('a record resolving nothing has no pins, and the line reads the whole record', () => {
  const atlas = atlasOf([
    entry({ region: 'Santorini' }, 0),
    entry({ country: 'Greece' }, 1),
    entry({}, 2),
  ], LOOKUP, colourOf)
  assert.deepEqual(atlas.pins, [])
  assert.equal(atlas.wines, 3)
  assert.equal(atlas.unplaced, 3)
  assert.equal(unplacedLine(atlas), '3 wines, none placed')
  assert.equal(unplacedLine(atlasOf([entry({ region: 'Santorini' })], LOOKUP, colourOf)), '1 wine, none placed')
})

test('a grape resolving to no colour, or no grape, is placed without a colour and not unplaced', () => {
  const atlas = atlasOf([
    entry({ region: 'Napa Valley', grape: 'Not A Grape', rating: 6.5 }, 0),
    entry({ region: 'Napa Valley', rating: 7 }, 1),
  ], LOOKUP, colourOf)
  assert.deepEqual(atlas.pins.map((p) => [p.id, p.rating, p.colour]), [
    ['synthetic-0', 6.5, undefined],
    ['synthetic-1', 7, undefined],
  ])
  assert.equal(atlas.unplaced, 0)
  assert.equal(unplacedLine(atlas), undefined)
})

test('an empty book has no pins and no line', () => {
  const atlas = atlasOf([], LOOKUP, colourOf)
  assert.deepEqual(atlas, { wines: 0, pins: [], unplaced: 0 })
  assert.equal(unplacedLine(atlas), undefined)
})

test('the lookup is the carried file less its _source key', () => {
  assert.equal(LOOKUP.has('_source'), false)
  assert.equal(LOOKUP.size, 65)
})
