// The sign-in screen's states, and which one each outcome selects. Kept
// apart from the screen that draws them and from the client, so the harness
// can call the selection without a document or a network.
//
// The credential is a one-time code sent by mail and typed into the browser
// the member is already in. Three states. Every outcome carrying an answer
// from the provider selects one state, so the screen never discloses whether
// an address has an account: for a request, a refusal for want of an
// account, a sending limit and a server error alike, since a limit or a
// failed send arises only where a code would be sent; for a verification, a
// wrong code, an expired code and a code for an address with no account
// alike. Only a failure with no answer at all is the same for every address,
// and only that is told apart.

export type SignInState = 'requested' | 'code-mismatch' | 'unavailable'

export const SIGN_IN_MESSAGES: Record<SignInState, string> = {
  requested:
    'If that address has an account, a sign-in code is on its way. Enter it below. Codes can be requested twice an hour.',
  'code-mismatch': 'That code did not match. Check it and enter it again, or request a new one.',
  unavailable: 'Sign-in cannot be reached just now. Try again in a few minutes.',
}

// The client marks a failure that received no HTTP response with status 0;
// any other status, or none, is a response.

// The outcome of requesting a code: the error the client returned, if any.
export function stateOfRequest(error: { status?: number } | null): SignInState {
  return error?.status === 0 ? 'unavailable' : 'requested'
}

// The outcome of verifying a code. No error selects no message: the session
// has arrived, and the gate lets it through.
export function stateOfVerification(error: { status?: number } | null): SignInState | undefined {
  if (!error) return undefined
  return error.status === 0 ? 'unavailable' : 'code-mismatch'
}
