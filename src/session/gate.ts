// The gate's decision, apart from the routing. The client restores a stored
// session asynchronously, so a state not yet known is held rather than
// treated as absent: deciding early would show the sign-in screen to a
// signed-in member for a moment on every load.

export type SessionStatus = 'unknown' | 'absent' | 'present'

export type GateDecision = 'hold' | 'sign-in' | 'through'

export function decide(status: SessionStatus): GateDecision {
  switch (status) {
    case 'unknown':
      return 'hold'
    case 'absent':
      return 'sign-in'
    case 'present':
      return 'through'
  }
}
