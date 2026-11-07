import type { Entry } from '../entries/entry.ts'

// The Book's filter panel, run in memory over the loaded book. No filter
// crosses the seam. Every option is a value present in the member's own
// entries; a country narrows the regions offered to those recorded under
// it. The panel narrows and the sort orders what remains.

export type Sort = 'rating-desc' | 'rating-asc'

export interface Filters {
  search: string
  country: string
  grape: string
  colour: string
  // The lowest rating shown, as a whole number; empty for any.
  rating: string
  region: string
  sort: Sort
}

export const NO_FILTERS: Filters = {
  search: '',
  country: '',
  grape: '',
  colour: '',
  rating: '',
  region: '',
  sort: 'rating-desc',
}

export interface Options {
  country: string[]
  grape: string[]
  colour: string[]
  rating: string[]
  region: string[]
}

// Matching ignores case and surrounding space, and nothing else.
function key(text: string): string {
  return text.trim().normalize('NFC').toLowerCase()
}

function distinct(values: (string | undefined)[]): string[] {
  const set = new Set<string>()
  for (const value of values) if (value) set.add(value)
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function optionsOf(entries: Entry[], country: string): Options {
  const floors = new Set(entries.map((e) => Math.floor(e.rating)))
  return {
    country: distinct(entries.map((e) => e.country)),
    grape: distinct(entries.map((e) => e.grape)),
    colour: distinct(entries.map((e) => e.colour)),
    rating: [...floors].sort((a, b) => b - a).map(String),
    region: distinct(entries.filter((e) => !country || e.country === country).map((e) => e.region)),
  }
}

const SEARCHED = ['producer', 'wine', 'region', 'country', 'grape'] as const

export function filterEntries(entries: Entry[], f: Filters): Entry[] {
  const search = key(f.search)
  const floor = f.rating === '' ? undefined : Number(f.rating)
  return entries.filter(
    (e) =>
      (!search || SEARCHED.some((field) => e[field] && key(e[field]).includes(search))) &&
      (!f.country || e.country === f.country) &&
      (!f.grape || e.grape === f.grape) &&
      (!f.colour || e.colour === f.colour) &&
      (floor === undefined || e.rating >= floor) &&
      (!f.region || e.region === f.region),
  )
}

// By rating, and among equal ratings by date tasted, most recent first.
// Dates are ISO, YYYY-MM-DD, so they compare as strings. An entry with no
// date follows those with one.
export function sortEntries(entries: Entry[], sort: Sort): Entry[] {
  const sign = sort === 'rating-desc' ? 1 : -1
  return [...entries].sort(
    (a, b) => sign * (b.rating - a.rating) || (b.dateTasted ?? '').localeCompare(a.dateTasted ?? ''),
  )
}

export function isFiltered(f: Filters): boolean {
  return (Object.keys(NO_FILTERS) as (keyof Filters)[]).some((k) => f[k] !== NO_FILTERS[k])
}
