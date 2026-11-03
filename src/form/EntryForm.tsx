import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  CODEX,
  entryStore,
  newEntryId,
  type DistinctField,
  type Entry,
  type EntryFields,
} from '../entries/index.ts'
import { COLOUR_LABELS, COLOURS, colourOf } from '../reference/grapes.ts'

// The entry form: one screen in two modes, new and edit. It writes through
// the seam alone, and validation is the seam's; the form's own constraints
// only spare a round trip. The four required fields come first and Save is
// held at the foot, so on a phone both are in view without scrolling.
//
// Autocomplete offers the member's own prior values and accepts anything
// new. Colour follows the grape until the member chooses one; a grape the
// catalogue does not know leaves it unset. Region is kept as typed and
// resolved to nothing.

type Values = Record<keyof EntryFields, string>

// Today in the member's own time zone, YYYY-MM-DD.
function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function valuesOf(entry?: Entry): Values {
  return {
    producer: entry?.producer ?? '',
    wine: entry?.wine ?? '',
    vintage: entry?.vintage ?? '',
    rating: entry ? entry.rating.toFixed(1) : '',
    grape: entry?.grape ?? '',
    colour: entry?.colour ?? '',
    country: entry?.country ?? '',
    region: entry?.region ?? '',
    dateTasted: entry ? (entry.dateTasted ?? '') : today(),
  }
}

// An empty optional field is absent rather than an empty string.
function fieldsOf(v: Values): EntryFields {
  const optional = (s: string) => s.trim() || undefined
  return {
    producer: v.producer.trim(),
    wine: v.wine.trim(),
    vintage: v.vintage.trim(),
    rating: Number(v.rating.trim().replace(',', '.')),
    grape: optional(v.grape),
    colour: optional(v.colour),
    country: optional(v.country),
    region: optional(v.region),
    dateTasted: optional(v.dateTasted),
  }
}

function withoutAbsent(fields: EntryFields): EntryFields {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as unknown as EntryFields
}

const DISTINCT: DistinctField[] = ['producer', 'grape', 'country', 'region']

function useDistinct(): Partial<Record<DistinctField, string[]>> {
  const [distinct, setDistinct] = useState<Partial<Record<DistinctField, string[]>>>({})
  useEffect(() => {
    let live = true
    for (const field of DISTINCT) {
      entryStore.listDistinct(field).then(
        (values) => live && setDistinct((d) => ({ ...d, [field]: values })),
        () => {},
      )
    }
    return () => {
      live = false
    }
  }, [])
  return distinct
}

function EntryForm({ entry }: { entry?: Entry }) {
  const navigate = useNavigate()
  const distinct = useDistinct()
  const [id] = useState(() => entry?.id ?? newEntryId())
  const [values, setValues] = useState(() => valuesOf(entry))
  // A stored colour other than the grape's own was the member's choice.
  const [colourChosen, setColourChosen] = useState(
    () => !!entry && (entry.colour ?? '') !== (colourOf(entry.grape ?? '') ?? ''),
  )
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const set = (key: keyof Values) => (value: string) =>
    setValues((v) => ({ ...v, [key]: value }))

  function setGrape(grape: string) {
    setValues((v) => ({
      ...v,
      grape,
      colour: colourChosen ? v.colour : (colourOf(grape) ?? ''),
    }))
  }

  function setColour(colour: string) {
    setColourChosen(true)
    set('colour')(colour)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError(undefined)
    const fields = fieldsOf(values)
    try {
      if (entry) {
        await entryStore.updateEntry(id, fields)
        navigate(`/entries/${id}`)
      } else {
        await entryStore.createEntry(CODEX, { ...withoutAbsent(fields), id })
        navigate('/')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  const text = (key: keyof Values, label: string, list?: DistinctField) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        name={key}
        value={values[key]}
        onChange={(e) => (key === 'grape' ? setGrape : set(key))(e.target.value)}
        list={list && `${list}-values`}
        autoComplete="off"
        autoCapitalize="words"
        required={key === 'producer' || key === 'wine'}
      />
    </label>
  )

  return (
    <form className="entry-form" onSubmit={save}>
      <div className="form-required">
        {text('producer', 'Producer', 'producer')}
        {text('wine', 'Wine name')}
        <div className="field-pair">
          <label className="field">
            <span className="field-label">Vintage</span>
            <input
              name="vintage"
              value={values.vintage}
              onChange={(e) => set('vintage')(e.target.value.toUpperCase())}
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={4}
              pattern="\d{4}|NV"
              title="A four-digit year, or NV"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Rating</span>
            <input
              name="rating"
              value={values.rating}
              onChange={(e) => set('rating')(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              pattern="10([.,]0)?|\d([.,]\d)?"
              title="0.0 to 10.0, one decimal"
              required
            />
          </label>
        </div>
      </div>

      <div className="form-optional">
        {text('grape', 'Grape', 'grape')}
        <label className="field">
          <span className="field-label">Colour</span>
          <select name="colour" value={values.colour} onChange={(e) => setColour(e.target.value)}>
            <option value="" />
            {COLOURS.map((c) => <option key={c} value={c}>{COLOUR_LABELS[c]}</option>)}
          </select>
        </label>
        {text('country', 'Country', 'country')}
        {text('region', 'Region', 'region')}
        <label className="field">
          <span className="field-label">Date tasted</span>
          <input
            type="date"
            name="dateTasted"
            value={values.dateTasted}
            onChange={(e) => set('dateTasted')(e.target.value)}
          />
        </label>
      </div>

      {DISTINCT.map((field) => (
        <datalist key={field} id={`${field}-values`}>
          {distinct[field]?.map((value) => <option key={value} value={value} />)}
        </datalist>
      ))}

      <nav className="screen-actions">
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="action" type="submit" disabled={saving}>Save</button>
      </nav>
    </form>
  )
}

function FormScreen({ title, back, children }: {
  title: string
  back: { to: string; label: string }
  children: ReactNode
}) {
  return (
    <main className="screen">
      <header className="screen-header">
        <Link className="back" to={back.to}>‹ {back.label}</Link>
        <h1 className="screen-title">{title}</h1>
      </header>
      {children}
    </main>
  )
}

export function NewEntry() {
  return (
    <FormScreen title="New entry" back={{ to: '/', label: 'The Book' }}>
      <EntryForm />
    </FormScreen>
  )
}

export function EditEntry() {
  const { id = '' } = useParams()
  const [entry, setEntry] = useState<Entry | null>()

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

  return (
    <FormScreen title="Edit entry" back={{ to: `/entries/${id}`, label: 'Entry' }}>
      {entry === null && <p className="book-line">This entry could not be found.</p>}
      {entry && <EntryForm entry={entry} />}
    </FormScreen>
  )
}
