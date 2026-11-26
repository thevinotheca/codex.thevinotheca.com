// The member's answer, at this origin, to whether the entries the device
// held before the account are to be added to it. One flag for the origin,
// held outside the entries store and never on an entry. Confirmed is kept
// for good. Declined is kept until the session ends, so the question
// returns at the next sign-in here.

export type Answer = 'confirmed' | 'declined'

export interface Consent {
  get(): Answer | undefined
  set(answer: Answer): void
  clearDecline(): void
}

const KEY = 'codex.attach'

// Browser storage can be absent or refuse; the answer is then held for the
// life of the page, and asked again on the next load.
export function storedConsent(storage: () => Storage): Consent {
  let held: Answer | undefined
  const read = (): Answer | undefined => {
    try {
      const value = storage().getItem(KEY)
      return value === 'confirmed' || value === 'declined' ? value : held
    } catch {
      return held
    }
  }
  const write = (answer: Answer | undefined) => {
    held = answer
    try {
      if (answer === undefined) storage().removeItem(KEY)
      else storage().setItem(KEY, answer)
    } catch {
      // Held in memory alone.
    }
  }
  return {
    get: read,
    set: write,
    clearDecline: () => {
      if (read() === 'declined') write(undefined)
    },
  }
}
