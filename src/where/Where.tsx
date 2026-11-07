import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { readBook } from '../book/read.ts'
import { placesOf, type Places } from './places.ts'

// Where you have been: the whole book by country and, within each, by
// region, with the totals across the top. A region opens the Book narrowed
// to it and the country it sat under. Wines with no region or no country are
// counted and named, never tappable. The view is not offered on an empty
// record; reached by address with one, it returns to the Book.

const wines = (n: number) => `${n} ${n === 1 ? 'wine' : 'wines'}`

function Where() {
  const [places, setPlaces] = useState<Places>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    readBook().then(
      (read) => live && setPlaces(placesOf(read)),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [])

  if (places?.wines === 0) return <Navigate to="/" replace />

  return (
    <main className="screen">
      <header className="screen-header">
        <Link className="back" to="/">‹ The Book</Link>
        <h1 className="screen-title">Where you have been</h1>
      </header>

      {failed && <p className="book-line">The book could not be opened.</p>}
      {places && (
        <>
          <dl className="places-totals">
            <div className="places-total"><dt>Wines</dt><dd>{places.wines}</dd></div>
            <div className="places-total"><dt>Regions</dt><dd>{places.regions}</dd></div>
            <div className="places-total"><dt>Countries</dt><dd>{places.countries.length}</dd></div>
          </dl>

          <ol className="places">
            {places.countries.map((c) => (
              <li key={c.country} className="place">
                <div className="place-country">
                  <h2 className="place-name">{c.country}</h2>
                  <span className="place-count">{c.count}</span>
                </div>
                <ul className="place-regions">
                  {c.regions.map((r) => (
                    <li key={r.region}>
                      <Link className="place-region" to="/" state={{ country: c.country, region: r.region }}>
                        <span>{r.region}</span>
                        <span className="place-count">{r.count}</span>
                      </Link>
                    </li>
                  ))}
                  {c.noRegion > 0 && (
                    <li className="place-unplaced">{wines(c.noRegion)} with no region recorded</li>
                  )}
                </ul>
              </li>
            ))}
          </ol>

          {places.unplaced > 0 && <p className="place-unplaced">{wines(places.unplaced)} not placed</p>}
        </>
      )}

      <nav className="screen-actions">
        <Link className="action" to="/atlas">The Atlas</Link>
      </nav>
    </main>
  )
}

export default Where
