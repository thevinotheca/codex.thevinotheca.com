import type { Entry } from '../entries/entry.ts'

// Where you have been, computed in memory over the loaded book. Entries are
// grouped on the stored country and region exactly. An entry with no country
// is not placed, its region included; one with a country and no region is
// counted under the country and named in no region. Countries, and regions
// within each, are ordered by count, most first, equal counts alphabetically.

export interface RegionGroup {
  region: string
  count: number
}

export interface CountryGroup {
  country: string
  count: number
  regions: RegionGroup[]
  // Wines under this country with no region recorded.
  noRegion: number
}

export interface Places {
  wines: number
  regions: number
  countries: CountryGroup[]
  // Wines with no country recorded.
  unplaced: number
}

function ordered<T extends { count: number }>(groups: T[], name: (group: T) => string): T[] {
  return groups.sort((a, b) => b.count - a.count || name(a).localeCompare(name(b)))
}

export function placesOf(entries: Entry[]): Places {
  const countries = new Map<string, { count: number; noRegion: number; regions: Map<string, number> }>()
  let unplaced = 0
  for (const e of entries) {
    if (!e.country) {
      unplaced++
      continue
    }
    let c = countries.get(e.country)
    if (!c) countries.set(e.country, (c = { count: 0, noRegion: 0, regions: new Map() }))
    c.count++
    if (e.region) c.regions.set(e.region, (c.regions.get(e.region) ?? 0) + 1)
    else c.noRegion++
  }
  const groups = [...countries].map(([country, c]) => ({
    country,
    count: c.count,
    regions: ordered([...c.regions].map(([region, count]) => ({ region, count })), (r) => r.region),
    noRegion: c.noRegion,
  }))
  return {
    wines: entries.length,
    regions: groups.reduce((n, g) => n + g.regions.length, 0),
    countries: ordered(groups, (g) => g.country),
    unplaced,
  }
}
