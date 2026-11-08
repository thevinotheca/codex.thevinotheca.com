import type { Entry } from '../entries/entry.ts'

// The Atlas, computed in memory over the loaded book. The stored region is
// joined against the carried lookup exactly, byte for byte: nothing is
// trimmed, folded or aliased, and a region the lookup does not hold resolves
// to nothing rather than to a parent's place. The join is transient; no
// coordinate is written to the store. An entry whose region does not
// resolve, no region included, is unplaced. A placed entry whose grape
// resolves to no colour is still placed, and drawn in the neutral colour.

export interface Place {
  lat: number
  lng: number
}

export type Lookup = ReadonlyMap<string, Place>

export interface Pin extends Place {
  id: string
  rating: number
  colour?: string
}

export interface AtlasData {
  wines: number
  pins: Pin[]
  // Wines whose region could not be resolved.
  unplaced: number
}

// The carried file, less its _source key.
export function lookupOf(json: Record<string, unknown>): Lookup {
  return new Map(
    Object.entries(json).filter(([key]) => key !== '_source') as [string, Place][],
  )
}

export function atlasOf(
  entries: Entry[],
  lookup: Lookup,
  colourOf: (grape: string) => string | undefined,
): AtlasData {
  const pins: Pin[] = []
  for (const e of entries) {
    const place = e.region === undefined ? undefined : lookup.get(e.region)
    if (!place) continue
    pins.push({
      id: e.id,
      lat: place.lat,
      lng: place.lng,
      rating: e.rating,
      colour: e.grape === undefined ? undefined : colourOf(e.grape),
    })
  }
  return { wines: entries.length, pins, unplaced: entries.length - pins.length }
}

const wines = (n: number) => `${n} ${n === 1 ? 'wine' : 'wines'}`

// The unplaced line: a remainder where anything is placed, the whole record
// where nothing is, and absent where everything is.
export function unplacedLine(atlas: AtlasData): string | undefined {
  if (atlas.unplaced === 0) return undefined
  if (atlas.pins.length === 0) return `${wines(atlas.wines)}, none placed`
  return `${wines(atlas.unplaced)} not placed`
}
