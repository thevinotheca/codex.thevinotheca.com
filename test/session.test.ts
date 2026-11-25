import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decide } from '../src/session/gate.ts'
import { SIGN_IN_MESSAGES, stateOfRequest, stateOfReturn } from '../src/session/states.ts'

// The sign-in selection and the gate's decision, called apart from the
// screen that draws them and the routing that acts on them. Nothing here
// reaches the network, a document or the client. The screens, the client
// and the flow itself are not covered here; the walk covers them.

const ORIGIN = 'https://example.test'

test('a request that succeeded selects the one address-dependent message', () => {
  assert.equal(stateOfRequest(null), 'requested')
})

test('every response from the provider, server errors included, selects that same message', () => {
  // Registration closed, the per-address interval, the hourly cap, the
  // sender refusing an address off the team, and a failed send: each is a
  // response, and a limit or a failed send arises only where a link would
  // be sent, so none may be told apart.
  for (const status of [400, 403, 422, 429, 500, 502, 503, 504, 522]) {
    assert.equal(stateOfRequest({ status }), 'requested', `status ${status}`)
  }
  assert.equal(stateOfRequest({}), 'requested')
})

test('only a failure with no response at all selects unavailable', () => {
  assert.equal(stateOfRequest({ status: 0 }), 'unavailable')
})

test('the requested message states the cap without saying whether it applied', () => {
  assert.equal(
    SIGN_IN_MESSAGES.requested,
    'If that address has an account, a sign-in link is on its way. Links can be requested twice an hour.',
  )
})

test('a link returned with an error, in the fragment or the query, selects link-invalid', () => {
  const fragment =
    '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
  assert.equal(stateOfReturn(`${ORIGIN}/sign-in/complete${fragment}`), 'link-invalid')
  assert.equal(stateOfReturn(`${ORIGIN}/?error=access_denied&error_code=otp_expired`), 'link-invalid')
  assert.equal(stateOfReturn(`${ORIGIN}/#error_description=Something`), 'link-invalid')
  assert.equal(
    SIGN_IN_MESSAGES['link-invalid'],
    'This link has expired or was already used. Request a new one.',
  )
})

test('an address with no error in it selects no message', () => {
  assert.equal(stateOfReturn(`${ORIGIN}/`), undefined)
  assert.equal(stateOfReturn(`${ORIGIN}/account`), undefined)
  assert.equal(stateOfReturn(`${ORIGIN}/sign-in/complete#access_token=t&refresh_token=r`), undefined)
})

test('there are three states and no fourth', () => {
  assert.deepEqual(Object.keys(SIGN_IN_MESSAGES).sort(), ['link-invalid', 'requested', 'unavailable'])
})

test('the gate holds an unknown session, answers an absent one, and passes a present one', () => {
  assert.equal(decide('unknown'), 'hold')
  assert.equal(decide('absent'), 'sign-in')
  assert.equal(decide('present'), 'through')
})
