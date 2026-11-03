import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { entryStore, type Entry, type EntryFields } from '../entries/index.ts'
import { COLOUR_LABELS, type Colour } from '../reference/grapes.ts'

// The Entry screen: one wine, read through the seam. Every field the member
// recorded, in the form's order; an empty field is absent, not shown blank.
// What the record carries for itself is never shown. Region is shown as
// typed. Delete asks in the screen, naming the wine, before it acts.

const LABELS: Record<keyof EntryFields, string> = {
  producer: 'Producer',
  wine: 'Wine name',
  vintage: 'Vintage',
  rating: 'Rating',
  grape: 'Grape',
  colour: 'Colour',
  country: 'Country',
  region: 'Region',
  dateTasted: 'Date tasted',
}

function shown(entry: Entry, key: keyof EntryFields): ReactNode {
  switch (key) {
    case 'producer':
      return <span className="entry-producer">{entry.producer}</span>
    case 'wine':
      return <em className="entry-wine">{entry.wine}</em>
    case 'vintage':
      return <span className="entry-mono">{entry.vintage}</span>
    case 'rating':
      return <span className="entry-mono entry-rating">{entry.rating.toFixed(1)}</span>
    case 'colour':
      return COLOUR_LABELS[entry.colour as Colour] ?? entry.colour
    default:
      return entry[key]
  }
}

function recorded(entry: Entry, key: keyof EntryFields): boolean {
  const value = entry[key]
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function Name({ entry }: { entry: Entry }) {
  return <>{entry.producer} <em>{entry.wine}</em> {entry.vintage}</>
}

function EntryScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [entry, setEntry] = useState<Entry | null>()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let live = true
    entryStore.getEntry(id).then(
      (read) => live && setEntry(read ?? null),
      () => live && setEntry(null),
    )
    return () => {
      live = false
    }
  }, [id])

  async function remove() {
    if (deleting) return
    setDeleting(true)
    setError(undefined)
    try {
      await entryStore.deleteEntry(id)
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDeleting(false)
    }
  }

  return (
    <main className="screen">
      <header className="screen-header">
        <Link className="back" to="/">‹ The Book</Link>
        <h1 className="screen-title">Entry</h1>
      </header>

      {entry === null && <p className="book-line">This entry could not be found.</p>}
      {entry && (
        <>
          <dl className="entry">
            {(Object.keys(LABELS) as (keyof EntryFields)[])
              .filter((key) => recorded(entry, key))
              .map((key) => (
                <div key={key} className="entry-field">
                  <dt className="field-label">{LABELS[key]}</dt>
                  <dd>{shown(entry, key)}</dd>
                </div>
              ))}
          </dl>

          <nav className="screen-actions">
            {error && <p className="form-error" role="alert">{error}</p>}
            {confirming ? (
              <>
                <p className="entry-confirm">Delete <Name entry={entry} />?</p>
                <div className="action-pair">
                  <button
                    className="action action-quiet"
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={deleting}
                  >
                    Keep
                  </button>
                  <button className="action" type="button" onClick={remove} disabled={deleting}>
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <div className="action-pair">
                <button
                  className="action action-quiet"
                  type="button"
                  onClick={() => setConfirming(true)}
                >
                  Delete
                </button>
                <Link className="action" to={`/entries/${id}/edit`}>Edit</Link>
              </div>
            )}
          </nav>
        </>
      )}
    </main>
  )
}

export default EntryScreen
