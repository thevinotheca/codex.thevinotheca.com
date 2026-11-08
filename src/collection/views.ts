import type { Entry } from '../entries/entry.ts'

// The Collection, computed in memory over the loaded book: six counts and
// two means. Entries are grouped on the stored value exactly, as Where you
// have been groups them. An entry with no value for a grouping is not put in
// a group of its own; it is counted in that view's unnamed line, so that the
// groups and the unnamed make the wines.
//
// The two means are each category's own arithmetic mean, with its count; the
// leaf's shrinkage is not carried. A category of fewer than two entries is
// not drawn, and is named beneath the chart instead. The counts have no floor.

// The Collection is drawn at this width and above, and not below it.
export const WIDTH = 1100

// The Collection opens at this many entries; it counts entries, not ratings.
export const ENTRIES = 10

// The floor for a drawn mean.
export const FLOOR = 2

export type Notice = 'width' | 'entries'

// Width before entry count, so a screen below both states the width alone.
export function noticeOf(width: number, entries: number): Notice | undefined {
  if (width < WIDTH) return 'width'
  if (entries < ENTRIES) return 'entries'
  return undefined
}

export interface Bar {
  label: string
  count: number
}

export interface Count {
  bars: Bar[]
  // Wines with no value for this grouping.
  unnamed: number
}

export interface MeanBar extends Bar {
  mean: number
}

export interface Mean {
  bars: MeanBar[]
  // Categories holding fewer entries than the floor, by name.
  single: string[]
  unnamed: number
}

export type World = 'Old World' | 'New World'

export interface Collection {
  wines: number
  ratings: Count
  colours: Count
  vintages: Count
  countries: Count
  regions: Count
  grapes: Count
  byCountry: Mean
  byGrape: Mean
}

type Field = 'country' | 'region' | 'grape' | 'colour'

function groups(entries: Entry[], value: (e: Entry) => string | undefined) {
  const map = new Map<string, Entry[]>()
  let unnamed = 0
  for (const e of entries) {
    const v = value(e)
    if (!v) {
      unnamed++
      continue
    }
    let group = map.get(v)
    if (!group) map.set(v, (group = []))
    group.push(e)
  }
  return { map, unnamed }
}

// Most first, equal counts alphabetically.
function byCount(a: Bar, b: Bar): number {
  return b.count - a.count || a.label.localeCompare(b.label)
}

export function countOf(entries: Entry[], field: Field): Count {
  const { map, unnamed } = groups(entries, (e) => e[field])
  const bars = [...map].map(([label, group]) => ({ label, count: group.length }))
  return { bars: bars.sort(byCount), unnamed }
}

export function meanOf(entries: Entry[], field: 'country' | 'grape'): Mean {
  const { map, unnamed } = groups(entries, (e) => e[field])
  const bars: MeanBar[] = []
  const single: string[] = []
  for (const [label, group] of map) {
    if (group.length < FLOOR) single.push(label)
    else bars.push({ label, count: group.length, mean: group.reduce((s, e) => s + e.rating, 0) / group.length })
  }
  return {
    bars: bars.sort((a, b) => b.mean - a.mean || byCount(a, b)),
    single: single.sort((a, b) => a.localeCompare(b)),
    unnamed,
  }
}

// Every rating present, highest first.
function ratingsOf(entries: Entry[]): Count {
  const { map } = groups(entries, (e) => e.rating.toFixed(1))
  const bars = [...map].map(([label, group]) => ({ label, count: group.length }))
  return { bars: bars.sort((a, b) => Number(b.label) - Number(a.label)), unnamed: 0 }
}

// Every vintage present, earliest first, NV last.
function vintagesOf(entries: Entry[]): Count {
  const { map } = groups(entries, (e) => e.vintage)
  const year = (v: string) => (v === 'NV' ? Infinity : Number(v))
  const bars = [...map].map(([label, group]) => ({ label, count: group.length }))
  return { bars: bars.sort((a, b) => year(a.label) - year(b.label)), unnamed: 0 }
}

export function collectionOf(entries: Entry[]): Collection {
  return {
    wines: entries.length,
    ratings: ratingsOf(entries),
    colours: countOf(entries, 'colour'),
    vintages: vintagesOf(entries),
    countries: countOf(entries, 'country'),
    regions: countOf(entries, 'region'),
    grapes: countOf(entries, 'grape'),
    byCountry: meanOf(entries, 'country'),
    byGrape: meanOf(entries, 'grape'),
  }
}

// The carried classifications, less the _source key, as region to world.
// The join is exact, as the Atlas's is; a region the file does not hold
// resolves to nothing.
export function worldsOf(json: Record<string, unknown>): ReadonlyMap<string, World> {
  return new Map(
    Object.entries(json)
      .filter(([key]) => key !== '_source')
      .map(([region, c]) => [region, (c as { world: World }).world]),
  )
}
