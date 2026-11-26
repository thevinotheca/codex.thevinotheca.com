import { CODEX, type Codex, type Entry } from '../entries/index.ts'
import type { Consent } from './consent.ts'
import { pull, push, type Backend, type Pending } from './sync.ts'

// The reconciler: one synchronisation is a pull of the whole record, a
// comparison with what the device holds, the server's later records written
// onto the device, and the device's later records pushed. Nothing marks an
// entry as pending; pending is what the comparison finds. Last write wins on
// the device's updatedAt, strictly: greater wins, equal leaves the existing
// record alone, on either side. Tombstones travel as ordinary records.
//
// No push leaves this origin until the member has said that the entries it
// held are to be added to the account. The pull is not held back.

export interface Device {
  readRecords(codex: Codex): Promise<Entry[]>
  applyRecords(records: readonly Entry[]): Promise<string[]>
}

export interface Plan extends Pending {
  // The server's records to write onto the device.
  apply: Entry[]
}

function later(a: Entry, b: Entry): boolean {
  return Date.parse(a.updatedAt) > Date.parse(b.updatedAt)
}

export function plan(local: readonly Entry[], remote: readonly Entry[]): Plan {
  const held = new Map(remote.map((e) => [e.id, e]))
  const mine = new Map(local.map((e) => [e.id, e]))
  return {
    apply: remote.filter((r) => {
      const l = mine.get(r.id)
      return l === undefined || later(r, l)
    }),
    insert: local.filter((l) => !held.has(l.id)),
    update: local.filter((l) => {
      const r = held.get(l.id)
      return r !== undefined && later(l, r)
    }),
  }
}

export type Phase = 'idle' | 'syncing' | 'failed'

export interface SyncState {
  phase: Phase
  // Entries the device holds that the server does not, or holds earlier.
  // Absent until a pull has succeeded in this session: without one there is
  // nothing to compare against.
  pending?: ReadonlySet<string>
  // Set while the member's answer is awaited; the number of entries found.
  question?: { count: number }
  // Advances whenever the server's records are written onto the device.
  revision: number
}

export class Synchroniser {
  private session = false
  private running?: Promise<void>
  private again = false
  // The server's updatedAt for each identifier, as last read or written.
  private remote?: Map<string, string>
  private state: SyncState = { phase: 'idle', revision: 0 }
  private readonly listeners = new Set<() => void>()
  private readonly client: Backend
  private readonly device: Device
  private readonly consent: Consent

  constructor(client: Backend, device: Device, consent: Consent) {
    this.client = client
    this.device = device
    this.consent = consent
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getState = (): SyncState => this.state

  private set(change: Partial<SyncState>): void {
    this.state = { ...this.state, ...change }
    for (const listener of this.listeners) listener()
  }

  // A session appearing starts a synchronisation; one ending forgets what
  // was read and any decline, so the question returns at the next sign-in.
  sessionChanged(present: boolean): Promise<void> {
    if (!present) {
      this.session = false
      this.remote = undefined
      this.consent.clearDecline()
      this.set({ phase: 'idle', pending: undefined, question: undefined })
      return Promise.resolve()
    }
    if (this.session) return Promise.resolve()
    this.session = true
    return this.request()
  }

  // Runs a synchronisation, or one more after the one running. Never rejects.
  request(): Promise<void> {
    if (!this.session) return Promise.resolve()
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.loop().finally(() => {
      this.running = undefined
    })
    return this.running
  }

  confirm(): Promise<void> {
    this.consent.set('confirmed')
    this.set({ question: undefined })
    return this.request()
  }

  decline(): void {
    this.consent.set('declined')
    this.set({ question: undefined })
  }

  private async loop(): Promise<void> {
    do {
      this.again = false
      await this.once()
    } while (this.again && this.session)
  }

  private snapshot(records: readonly Entry[]): void {
    this.remote = new Map(records.map((e) => [e.id, e.updatedAt]))
  }

  private applied(ids: readonly string[]): void {
    if (ids.length > 0) this.set({ revision: this.state.revision + 1 })
  }

  private async once(): Promise<void> {
    this.set({ phase: 'syncing' })
    try {
      const remote = await pull(this.client)
      this.snapshot(remote)
      const local = await this.device.readRecords(CODEX)
      const work = plan(local, remote)
      this.applied(await this.device.applyRecords(work.apply))

      if (this.mayPush(local)) {
        const { superseded } = await push(this.client, work)
        for (const e of [...work.insert, ...work.update]) {
          if (!superseded.includes(e.id)) this.remote?.set(e.id, e.updatedAt)
        }
        // The server already held this write or a later one; take what it
        // holds, which the strict comparison keeps from an equal record.
        if (superseded.length > 0) {
          const after = await pull(this.client)
          this.snapshot(after)
          this.applied(await this.device.applyRecords(after))
        }
      }
      this.set({ phase: 'idle', pending: await this.pendingNow() })
    } catch {
      let pending = this.state.pending
      try {
        pending = await this.pendingNow()
      } catch {
        // Keep the last comparison.
      }
      this.set({ phase: 'failed', pending })
    }
  }

  private mayPush(local: readonly Entry[]): boolean {
    const answer = this.consent.get()
    if (answer === 'confirmed') return true
    if (answer === 'declined') return false
    const count = local.filter((e) => e.deletedAt === undefined).length
    if (count === 0) {
      // Nothing here predates the account, so there is nothing to ask.
      this.consent.set('confirmed')
      return true
    }
    this.set({ question: { count } })
    return false
  }

  private async pendingNow(): Promise<ReadonlySet<string> | undefined> {
    const remote = this.remote
    if (remote === undefined) return undefined
    const pending = new Set<string>()
    for (const e of await this.device.readRecords(CODEX)) {
      const held = remote.get(e.id)
      if (held === undefined || Date.parse(e.updatedAt) > Date.parse(held)) pending.add(e.id)
    }
    return pending
  }
}
