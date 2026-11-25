// The sign-in screen's states, and which one each outcome selects. Kept
// apart from the screen that draws them and from the client, so the harness
// can call the selection without a document or a network.
//
// Three states, not four. The provider returns one code, otp_expired, for a
// link that has expired and for one already used, so the two are one state.
// And every outcome carrying an answer from the provider is one state, so
// the screen never discloses whether an address has an account: a refusal
// for want of an account, a sending limit, and a server error alike, since
// a limit or a failed send arises only where a link would be sent. Only a
// failure with no answer at all is the same for every address, and only
// that is told apart.

export type SignInState = 'requested' | 'link-invalid' | 'unavailable'

export const SIGN_IN_MESSAGES: Record<SignInState, string> = {
  requested:
    'If that address has an account, a sign-in link is on its way. Links can be requested twice an hour.',
  'link-invalid': 'This link has expired or was already used. Request a new one.',
  unavailable: 'Sign-in cannot be reached just now. Try again in a few minutes.',
}

// The address a link returns to. It must match the provider's redirect entry
// exactly.
export const COMPLETION_PATH = '/sign-in/complete'

// The outcome of requesting a link: the error the client returned, if any.
// The client marks a failure that received no HTTP response with status 0;
// any other status is a response, and takes the address-dependent message.
export function stateOfRequest(error: { status?: number } | null): SignInState {
  return error?.status === 0 ? 'unavailable' : 'requested'
}

// The outcome of following a link, read from the address it returned to.
// The provider reports a failed link in the query or the fragment, as the
// client itself reads it.
export function stateOfReturn(href: string): SignInState | undefined {
  const url = new URL(href)
  const params = new URLSearchParams(url.hash.slice(1))
  url.searchParams.forEach((value, key) => params.set(key, value))
  if (params.has('error') || params.has('error_code') || params.has('error_description')) {
    return 'link-invalid'
  }
  return undefined
}
