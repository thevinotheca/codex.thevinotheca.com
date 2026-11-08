import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
  type ChartConfiguration,
  type Plugin,
} from 'chart.js'
import { readBook } from '../book/read.ts'
import { COLOUR_LABELS, colourOf, type Colour } from '../reference/grapes.ts'
import classifications from '../reference/region-classifications.json'
import { collectionOf, noticeOf, worldsOf, type Collection as Views, type Count, type Mean } from './views.ts'

// The Collection: the book's six counts and two means, drawn on a wide
// screen only. Below the width it states the width and shows nothing else;
// at or above it with too few entries it states that and shows nothing
// else. It is an ordinary screen, with its back control in the header and
// no action at the foot.
//
// The colour view reads each entry's stored colour. The grape view colours
// each grape by the carried catalogue and the region view each region by the
// carried classifications; a name either does not resolve is drawn in a
// neutral of its own.

Chart.register(ArcElement, BarController, BarElement, CategoryScale, DoughnutController, Legend, LinearScale, Tooltip)

const WORLDS = worldsOf(classifications)

const wines = (n: number) => `${n} ${n === 1 ? 'wine' : 'wines'}`

// The viewport's width, kept current.
function subscribe(changed: () => void) {
  window.addEventListener('resize', changed)
  return () => window.removeEventListener('resize', changed)
}
const useWidth = () => useSyncExternalStore(subscribe, () => window.innerWidth)

// The carried palette, read off the document so the canvas draws in it.
function tones() {
  const css = getComputedStyle(document.documentElement)
  const token = (name: string) => css.getPropertyValue(name).trim()
  return {
    house: token('--wine'),
    light: token('--wine-light'),
    neutral: token('--ink-faint'),
    ink: token('--ink-soft'),
    muted: token('--ink-muted'),
    rule: token('--border'),
    paper: token('--paper-raised'),
  }
}

// Leaf colours where the carried palette has no tone of its own.
const COLOUR_TONES: Record<Colour, string> = {
  red: '#7B1E2D',
  white: '#C9A227',
  sparkling: '#E5C04D',
  rosé: '#E89A9E',
}
const SPARKLING = '#C9A35B'
const ROSE = '#C17A8A'
const MEAN_COUNTRY = '#3D5A5F'
const MEAN_GRAPE = '#6B4A2D'

const SANS = { family: 'DM Sans', size: 11 }
const LABEL = { family: 'DM Sans', size: 11, weight: '500' }
const MONO = { family: 'JetBrains Mono', size: 10 }

const ROW = 22
const TALL = (bars: number) => Math.max(240, bars * ROW + 40)

type Config = ChartConfiguration<'bar' | 'doughnut'>

function tooltip(t: ReturnType<typeof tones>) {
  return { backgroundColor: t.ink, titleFont: SANS, bodyFont: SANS, padding: 10 }
}

function columns(count: Count, colour: string, t: ReturnType<typeof tones>): Config {
  return {
    type: 'bar',
    data: {
      labels: count.bars.map((b) => b.label),
      datasets: [{ data: count.bars.map((b) => b.count), backgroundColor: colour, borderRadius: 1 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...tooltip(t), callbacks: { label: (c) => wines(c.parsed.y as number) } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: t.muted, font: MONO, autoSkip: true, maxRotation: 0 } },
        y: { grid: { color: t.rule }, beginAtZero: true, ticks: { color: t.muted, font: MONO, precision: 0 } },
      },
    },
  }
}

function rows(count: Count, colours: string[] | string, t: ReturnType<typeof tones>): Config {
  return {
    type: 'bar',
    data: {
      labels: count.bars.map((b) => b.label),
      datasets: [{ data: count.bars.map((b) => b.count), backgroundColor: colours, borderRadius: 1, barThickness: 14 }],
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...tooltip(t), callbacks: { label: (c) => wines(c.parsed.x as number) } },
      },
      scales: {
        x: { grid: { color: t.rule }, beginAtZero: true, ticks: { color: t.muted, font: MONO, precision: 0 } },
        y: { grid: { display: false }, ticks: { color: t.ink, font: LABEL, autoSkip: false } },
      },
    },
  }
}

// Each mean's count, set at the end of its bar.
function countsBeside(mean: Mean, t: ReturnType<typeof tones>): Plugin<'bar'> {
  return {
    id: 'countsBeside',
    afterDatasetsDraw(chart) {
      const { ctx } = chart
      ctx.save()
      ctx.font = `${MONO.size}px ${MONO.family}`
      ctx.fillStyle = t.muted
      ctx.textBaseline = 'middle'
      chart.getDatasetMeta(0).data.forEach((bar, i) => {
        ctx.fillText(wines(mean.bars[i].count), bar.x + 6, bar.y)
      })
      ctx.restore()
    },
  }
}

// Ratings run 0.0 to 10.0, and the axis is the whole of that range.
function means(mean: Mean, colour: string, t: ReturnType<typeof tones>): Config {
  return {
    type: 'bar',
    data: {
      labels: mean.bars.map((b) => b.label),
      datasets: [{ data: mean.bars.map((b) => b.mean), backgroundColor: colour, borderRadius: 1, barThickness: 14 }],
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      layout: { padding: { right: 64 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltip(t),
          callbacks: { label: (c) => `${mean.bars[c.dataIndex].mean.toFixed(2)} over ${wines(mean.bars[c.dataIndex].count)}` },
        },
      },
      scales: {
        x: { grid: { color: t.rule }, min: 0, max: 10, ticks: { color: t.muted, font: MONO, callback: (v) => Number(v).toFixed(1) } },
        y: { grid: { display: false }, ticks: { color: t.ink, font: LABEL, autoSkip: false } },
      },
    },
    plugins: [countsBeside(mean, t) as Plugin<'bar' | 'doughnut'>],
  }
}

function doughnut(count: Count, t: ReturnType<typeof tones>): Config {
  return {
    type: 'doughnut',
    data: {
      labels: count.bars.map((b) => COLOUR_LABELS[b.label as Colour] ?? b.label),
      datasets: [{
        data: count.bars.map((b) => b.count),
        backgroundColor: count.bars.map((b) => COLOUR_TONES[b.label as Colour] ?? t.neutral),
        borderColor: t.paper,
        borderWidth: 2,
      }],
    },
    options: {
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { color: t.ink, font: SANS, padding: 10, boxWidth: 10, boxHeight: 10 } },
        tooltip: { ...tooltip(t), callbacks: { label: (c) => wines(c.parsed as number) } },
      },
    },
  }
}

function configsOf(v: Views) {
  const t = tones()
  const grape = (g: string) => {
    const c = colourOf(g)
    if (c === 'red') return t.house
    if (c === 'white') return t.light
    if (c === 'sparkling') return SPARKLING
    if (c === 'rosé') return ROSE
    return t.neutral
  }
  const region = (r: string) => {
    const w = WORLDS.get(r)
    if (w === 'Old World') return t.house
    if (w === 'New World') return t.light
    return t.neutral
  }
  return {
    ratings: columns(v.ratings, t.house, t),
    colours: doughnut(v.colours, t),
    vintages: columns(v.vintages, t.house, t),
    countries: rows(v.countries, t.house, t),
    regions: rows(v.regions, v.regions.bars.map((b) => region(b.label)), t),
    grapes: rows(v.grapes, v.grapes.bars.map((b) => grape(b.label)), t),
    byCountry: means(v.byCountry, MEAN_COUNTRY, t),
    byGrape: means(v.byGrape, MEAN_GRAPE, t),
  }
}

function Canvas({ config, height }: { config: Config; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let chart: Chart<'bar' | 'doughnut'> | undefined
    let live = true
    // Drawn once the faces have loaded, so the labels are set in them.
    document.fonts.ready.then(() => {
      if (live && ref.current) chart = new Chart(ref.current, config)
    })
    return () => {
      live = false
      chart?.destroy()
    }
  }, [config])
  return (
    <div className="chart-wrap" style={height ? { height } : undefined}>
      <canvas ref={ref} />
    </div>
  )
}

function Card({ title, sub, tall, children, lines }: {
  title: string
  sub?: ReactNode
  tall?: boolean
  children: ReactNode
  lines?: (string | false)[]
}) {
  return (
    <section className={tall ? 'chart-card chart-card-tall' : 'chart-card'}>
      <h2 className="chart-title">{title}</h2>
      {sub && <p className="chart-sub">{sub}</p>}
      {children}
      {lines?.filter(Boolean).map((line) => <p key={line as string} className="chart-unnamed">{line}</p>)}
    </section>
  )
}

const unnamed = (n: number, what: string) => n > 0 && `${wines(n)} with no ${what} recorded`
const single = (names: string[]) => names.length > 0 && `From one wine each, and not drawn: ${names.join(', ')}`

function Drawn({ views }: { views: Views }) {
  const c = useMemo(() => configsOf(views), [views])
  return (
    <>
      <div className="chart-hero">
        <Card title="Rating distribution" sub="highest on the left, descending">
          <Canvas config={c.ratings} />
        </Card>
        <Card title="By colour" sub="share of wines by colour" lines={[unnamed(views.colours.unnamed, 'colour')]}>
          <Canvas config={c.colours} />
        </Card>
        <Card title="Vintage distribution" sub="wines by harvest year">
          <Canvas config={c.vintages} />
        </Card>
      </div>

      <Card title="All countries" sub="every country in the book, ordered by count" tall
        lines={[unnamed(views.countries.unnamed, 'country')]}>
        <Canvas config={c.countries} height={TALL(views.countries.bars.length)} />
      </Card>

      <Card title="All regions" tall lines={[unnamed(views.regions.unnamed, 'region')]}
        sub={<><span className="chart-key chart-key-house">Old World</span> in deep bordeaux · <span className="chart-key chart-key-light">New World</span> in lighter bordeaux · unclassified in grey</>}>
        <Canvas config={c.regions} height={TALL(views.regions.bars.length)} />
      </Card>

      <Card title="All grape categories" tall lines={[unnamed(views.grapes.unnamed, 'grape')]}
        sub={<><span className="chart-key chart-key-house">red grapes</span> in deep bordeaux · <span className="chart-key chart-key-light">white grapes</span> in lighter bordeaux · <span className="chart-key" style={{ color: SPARKLING }}>sparkling</span> · <span className="chart-key" style={{ color: ROSE }}>rosé</span> · unresolved in grey</>}>
        <Canvas config={c.grapes} height={TALL(views.grapes.bars.length)} />
      </Card>

      <Card title="Average rating by country" sub="each country's mean rating, with the wines it is drawn from" tall
        lines={[single(views.byCountry.single), unnamed(views.byCountry.unnamed, 'country')]}>
        <Canvas config={c.byCountry} height={TALL(views.byCountry.bars.length)} />
      </Card>

      <Card title="Average rating by grape / category" sub="each grape's mean rating, with the wines it is drawn from" tall
        lines={[single(views.byGrape.single), unnamed(views.byGrape.unnamed, 'grape')]}>
        <Canvas config={c.byGrape} height={TALL(views.byGrape.bars.length)} />
      </Card>
    </>
  )
}

function Collection() {
  const width = useWidth()
  const [views, setViews] = useState<Views>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    readBook().then(
      (read) => live && setViews(collectionOf(read)),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [])

  // The width is known before the book is read, and is stated at once.
  const notice = noticeOf(width, views?.wines ?? Infinity)

  return (
    <main className={notice ? 'screen' : 'screen screen-wide'}>
      <header className="screen-header">
        <Link className="back" to="/">‹ The Book</Link>
        <h1 className="screen-title">The Collection</h1>
      </header>

      {notice === 'width' && <p className="book-line">The Collection is drawn on a wider screen.</p>}
      {notice !== 'width' && failed && <p className="book-line">The book could not be opened.</p>}
      {notice === 'entries' && (
        <p className="book-line">The Collection opens once there is enough to say something.</p>
      )}
      {!notice && views && <Drawn views={views} />}
    </main>
  )
}

export default Collection
