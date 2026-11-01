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

export function newEntryId(): string {
  return crypto.randomUUID()
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
}
