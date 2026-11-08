import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { circleMarker, latLngBounds, map as leafletMap, tileLayer } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { readBook } from '../book/read.ts'
import { colourOf } from '../reference/grapes.ts'
import regions from '../reference/regions.json'
import { atlasOf, lookupOf, unplacedLine, type AtlasData } from './pins.ts'

// The Atlas: the whole book on a map, edge to edge inside the safe-area
// insets, with the back control and the unplaced line floating over the
// tiles. A pin is sized by rating and coloured by the wine's colour, from
// the grape. The view fits the pins; one pin opens at a regional radius
// rather than at the street, and none opens at the named default view.
//
// The basemap is standard XYZ raster tiles, taken provisionally; the tiles
// are the screen's only outbound flow.

const LOOKUP = lookupOf(regions)

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// The view with nothing to fit: the world, whole, at phone width.
const DEFAULT_VIEW = { center: [20, 0] as [number, number], zoom: 2 }

// The closest the fit comes: a region and its neighbours, not a street.
const PLACE_ZOOM = 7

// Rating 0.0 to 10.0, as a radius in pixels.
const radius = (rating: number) => 4 + rating

function Atlas() {
  const [atlas, setAtlas] = useState<AtlasData>()
  const [failed, setFailed] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    readBook().then(
      (read) => live && setAtlas(atlasOf(read, LOOKUP, colourOf)),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!atlas || !mapRef.current) return
    const view = leafletMap(mapRef.current, { zoomControl: false })
    tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(view)
    for (const pin of atlas.pins) {
      circleMarker([pin.lat, pin.lng], {
        radius: radius(pin.rating),
        className: `pin pin-${pin.colour ?? 'none'}`,
      }).addTo(view)
    }
    if (atlas.pins.length === 0) view.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom)
    else {
      const bounds = latLngBounds(atlas.pins.map((p) => [p.lat, p.lng]))
      view.fitBounds(bounds, { padding: [48, 48], maxZoom: PLACE_ZOOM })
    }
    return () => {
      view.remove()
    }
  }, [atlas])

  const line = failed ? 'The book could not be opened.' : atlas && unplacedLine(atlas)

  return (
    <main className="atlas">
      <div className="atlas-map" ref={mapRef} />
      <Link className="atlas-chip atlas-back" to="/where-you-have-been">‹ Where you have been</Link>
      {line && <p className="atlas-chip atlas-unplaced">{line}</p>}
    </main>
  )
}

export default Atlas
