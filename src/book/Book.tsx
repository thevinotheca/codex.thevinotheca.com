import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { CODEX, entryStore, type Entry } from '../entries/index.ts'

// The Book: every entry in the codex, read through the seam a page at a
// time and ordered by rating, highest first. The seam pages in its own
// order, so the whole book is read before it is ordered.

const PAGE_SIZE = 100

async function readBook(): Promise<Entry[]> {
  const entries: Entry[] = []
  let cursor: string | undefined
  do {
    const page = await entryStore.listEntries(CODEX, { limit: PAGE_SIZE, cursor })
    entries.push(...page.entries)
    cursor = page.nextCursor
  } while (cursor !== undefined)
  return entries.sort((a, b) => b.rating - a.rating)
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

function Book() {
  const [entries, setEntries] = useState<Entry[]>()
  const [failed, setFailed] = useState(false)

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
        <ol className="book">
          {entries.map((entry) => <Row key={entry.id} entry={entry} />)}
        </ol>
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
