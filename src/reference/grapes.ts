import grapes from './grapes.json'

// Colour from grape, read out of the carried catalogue with the leaf's
// logic: red, then white, then sparkling, then rosé. Red and white resolve
// through the TasteRank lists and then the named blends and additional
// varieties; sparkling and rosé through those two alone. The first colour
// to claim a name keeps it. A name the catalogue does not know resolves to
// nothing; the colour is left for the member to choose.

export const COLOURS = ['red', 'white', 'sparkling', 'rosé'] as const

export type Colour = (typeof COLOURS)[number]

export const COLOUR_LABELS: Record<Colour, string> = {
  red: 'Red',
  white: 'White',
  sparkling: 'Sparkling',
  rosé: 'Rosé',
}

const TASTERANK: Partial<Record<Colour, string[]>> = {
  red: grapes.tasterank_reds,
  white: grapes.tasterank_whites,
}

const NAMED: [string, { color: string }][] = [
  ...Object.entries(grapes.named_blends),
  ...Object.entries(grapes.additional_varieties),
]

// Matching ignores case and surrounding space, and nothing else.
function key(name: string): string {
  return name.trim().normalize('NFC').toLowerCase()
}

const BY_NAME = new Map<string, Colour>()
for (const colour of COLOURS) {
  const names = [
    ...(TASTERANK[colour] ?? []),
    ...NAMED.filter(([, v]) => v.color === colour).map(([name]) => name),
  ]
  for (const name of names) {
    if (!BY_NAME.has(key(name))) BY_NAME.set(key(name), colour)
  }
}

export function colourOf(grape: string): Colour | undefined {
  return BY_NAME.get(key(grape))
}
