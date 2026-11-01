// The entry: what a member records of one wine tasted. Flat; the wine is
// text, not its own entity. There is no free-text note field.

export const SCHEMA_VERSION = 1

export type Codex = string

// A four-digit year, or NV.
export type Vintage = string

// The nine fields a member sees.
export interface EntryFields {
  producer: string
  wine: string
  vintage: Vintage
  rating: number
  grape?: string
  colour?: string
  country?: string
  region?: string
  dateTasted?: string
}

// Carried with every record and never shown to a member.
export interface Entry extends EntryFields {
  id: string
  codex: Codex
  schemaVersion: number
  updatedAt: string
  deletedAt?: string
  latitude?: number
  longitude?: number
}

export type EntryDraft = EntryFields & {
  id: string
  latitude?: number
  longitude?: number
}

export type EntryPatch = Partial<EntryFields> & {
  latitude?: number
  longitude?: number
}

export type DistinctField = 'producer' | 'grape' | 'country' | 'region'

// A random v4 UUID. randomUUID exists only in a secure context, so over
// plain http the id is built from getRandomValues, which exists in every one.
export function newEntryId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const REQUIRED = ['producer', 'wine', 'vintage', 'rating'] as const

export function validateFields(fields: EntryFields): void {
  for (const key of REQUIRED) {
    const value = fields[key]
    if (value === undefined || value === null || value === '') {
      throw new Error(`${key} is required`)
    }
  }
  if (!/^(\d{4}|NV)$/.test(fields.vintage)) {
    throw new Error('vintage must be a four-digit year or NV')
  }
  const { rating } = fields
  if (
    typeof rating !== 'number' ||
    !(rating >= 0 && rating <= 10) ||
    Math.round(rating * 10) / 10 !== rating
  ) {
    throw new Error('rating must be 0.0 to 10.0 with one decimal')
  }
  // The Book orders dates as strings, so only YYYY-MM-DD, and a real day.
  const { dateTasted } = fields
  if (
    dateTasted !== undefined &&
    !(
      /^\d{4}-\d{2}-\d{2}$/.test(dateTasted) &&
      !Number.isNaN(Date.parse(dateTasted)) &&
      new Date(dateTasted).toISOString().slice(0, 10) === dateTasted
    )
  ) {
    throw new Error('dateTasted must be a date written YYYY-MM-DD')
  }
}
