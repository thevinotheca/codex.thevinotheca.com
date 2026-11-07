import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { CODEX, entryStore, type Entry } from '../entries/index.ts'
import { COLOUR_LABELS, type Colour } from '../reference/grapes.ts'
import {
  filterEntries,
  isFiltered,
  NO_FILTERS,
  optionsOf,
  sortEntries,
  type Filters,
  type Options,
  type Sort,
} from './filter.ts'

// The Book: every entry in the codex, read through the seam a page at a
// time. The seam pages in its own order, so the whole book is read before
// it is filtered and ordered; the panel works over the whole of it.

const PAGE_SIZE = 100

async function readBook(): Promise<Entry[]> {
  const entries: Entry[] = []
  let cursor: string | undefined
  do {
    const page = await entryStore.listEntries(CODEX, { limit: PAGE_SIZE, cursor })
    entries.push(...page.entries)
    cursor = page.nextCursor
  } while (cursor !== undefined)
  return entries
}

function Row({ entry }: { entry: Entry }) {
  return (
    <li>
      <Link className="row" to={`/entries/${entry.id}`}>
        <span className="row-producer">{entry.producer}</span>
        <span className="row-wine">
          <em>{entry.wine}</em> <span className="row-vintage">{entry.vintage}</span>
        </span>
        <span className="row-rating">{entry.rating.toFixed(1)}</span>
        {entry.dateTasted && <span className="row-date">{entry.dateTasted}</span>}
      </Link>
    </li>
  )
}

function Choice({ label, value, onChange, children }: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  )
}

const any = (values: string[], label: (value: string) => string = (v) => v) => (
  <>
    <option value="">Any</option>
    {values.map((v) => <option key={v} value={v}>{label(v)}</option>)}
  </>
)

// The search field sits above the list and beside it one control, carrying
// the count of what is showing, that opens the rest of the panel in place.
// Reset is inside the opened panel; Escape resets wherever a keyboard is.
function Panel({ filters, setFilters, options, showing, total }: {
  filters: Filters
  setFilters: (f: Filters) => void
  options: Options
  showing: number
  total: number
}) {
  const [open, setOpen] = useState(false)
  const set = (k: keyof Filters) => (value: string) => setFilters({ ...filters, [k]: value })
  const escape = (e: KeyboardEvent) => e.key === 'Escape' && setFilters(NO_FILTERS)

  // The bar is a child of the screen rather than of a wrapper, so that it
  // stays in view the length of the list.
  return (
    <>
      <div className="filter-bar" onKeyDown={escape}>
        <input
          className="filter-search"
          type="search"
          value={filters.search}
          onChange={(e) => set('search')(e.target.value)}
          placeholder="Search"
          aria-label="Search producer, wine, region, country, grape"
          autoComplete="off"
          autoCapitalize="off"
          enterKeyHint="search"
        />
        <button
          className="filter-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="filter-panel"
          onClick={() => setOpen(!open)}
        >
          <span className="filter-toggle-label">Filter {open ? '▴' : '▾'}</span>
          <span className="filter-count">{showing} of {total}</span>
        </button>
      </div>

      {open && (
        <div className="filter-panel" id="filter-panel" onKeyDown={escape}>
          <Choice label="Country" value={filters.country} onChange={set('country')}>
            {any(options.country)}
          </Choice>
          <Choice label="Region" value={filters.region} onChange={set('region')}>
            {any(options.region)}
          </Choice>
          <Choice label="Grape or category" value={filters.grape} onChange={set('grape')}>
            {any(options.grape)}
          </Choice>
          <Choice label="Colour" value={filters.colour} onChange={set('colour')}>
            {any(options.colour, (c) => COLOUR_LABELS[c as Colour] ?? c)}
          </Choice>
          <Choice label="Rating" value={filters.rating} onChange={set('rating')}>
            {any(options.rating, (r) => `${r}.0 and above`)}
          </Choice>
          <Choice label="Sort by rating" value={filters.sort} onChange={(v) => set('sort')(v as Sort)}>
            <option value="rating-desc">Highest first</option>
            <option value="rating-asc">Lowest first</option>
          </Choice>
          <button
            className="action action-quiet filter-reset"
            type="button"
            disabled={!isFiltered(filters)}
            onClick={() => setFilters(NO_FILTERS)}
          >
            Reset
          </button>
        </div>
      )}
    </>
  )
}

function Book() {
  const [entries, setEntries] = useState<Entry[]>()
  const [failed, setFailed] = useState(false)
  const [filters, setFilters] = useState(NO_FILTERS)

  useEffect(() => {
    let live = true
    readBook().then(
      (read) => live && setEntries(read),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [])

  const options = useMemo(() => optionsOf(entries ?? [], filters.country), [entries, filters.country])

  // A region not recorded under the chosen country is cleared with it.
  function updateFilters(next: Filters) {
    const regions = optionsOf(entries ?? [], next.country).region
    setFilters(regions.includes(next.region) ? next : { ...next, region: '' })
  }
  const shown = useMemo(
    () => sortEntries(filterEntries(entries ?? [], filters), filters.sort),
    [entries, filters],
  )

  return (
    <main className="screen">
      <header className="screen-header">
        <h1 className="screen-title">The Book</h1>
        <div className="meta">
          <div className="author">Jure Skarabot · New York</div>
        </div>
      </header>

      {failed && <p className="book-line">The book could not be opened.</p>}
      {entries?.length === 0 && (
        <p className="book-line">The Book keeps every wine you taste, with your rating of it.</p>
      )}
      {entries && entries.length > 0 && (
        <>
          <Panel
            filters={filters}
            setFilters={updateFilters}
            options={options}
            showing={shown.length}
            total={entries.length}
          />
          {shown.length > 0 ? (
            <ol className="book">
              {shown.map((entry) => <Row key={entry.id} entry={entry} />)}
            </ol>
          ) : (
            <p className="book-line">No wine in the Book matches.</p>
          )}
        </>
      )}

      <ul className="screen-links">
        <li><Link to="/where-you-have-been">Where you have been</Link></li>
        <li><Link to="/account">Account</Link></li>
      </ul>

      <nav className="screen-actions">
        <Link className="action" to="/entries/new">Add</Link>
      </nav>
    </main>
  )
}

export default Book
