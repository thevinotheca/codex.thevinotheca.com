import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { decide } from '../src/session/gate.ts'
import { SIGN_IN_MESSAGES, stateOfRequest, stateOfVerification } from '../src/session/states.ts'

// The sign-in selection and the gate's decision, called apart from the
// screen that draws them and the routing that acts on them. Nothing here
// reaches the network, a document or the client. The screens, the client
// and the flow itself are not covered here; the walk covers them.

// Registration closed, the per-address interval, the hourly cap, the sender
// refusing an address off the team, a wrong or expired code, and a failed
// send or server error: each is a response.
const RESPONSE_STATUSES = [400, 403, 422, 429, 500, 502, 503, 504, 522]

test('a request that succeeded selects the one address-dependent message', () => {
  assert.equal(stateOfRequest(null), 'requested')
})

test('every response from the provider, server errors included, selects that same message', () => {
  // A limit or a failed send arises only where a code would be sent, so
  // none may be told apart.
  for (const status of RESPONSE_STATUSES) {
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
    'If that address has an account, a sign-in code is on its way. Enter it below. Codes can be requested twice an hour.',
  )
})

test('a verification that succeeded selects no message', () => {
  assert.equal(stateOfVerification(null), undefined)
})

test('every answer-bearing outcome of verification selects one message', () => {
  // A wrong code, an expired code and a code for an address with no account
  // must not be told apart, nor a limit or a server error from them.
  for (const status of RESPONSE_STATUSES) {
    assert.equal(stateOfVerification({ status }), 'code-mismatch', `status ${status}`)
  }
  assert.equal(stateOfVerification({}), 'code-mismatch')
  assert.equal(
    SIGN_IN_MESSAGES['code-mismatch'],
    'That code did not match. Check it and enter it again, or request a new one.',
  )
})

test('only a failure with no response at all selects unavailable, for verification as for requesting', () => {
  assert.equal(stateOfVerification({ status: 0 }), 'unavailable')
  assert.equal(stateOfRequest({ status: 0 }), 'unavailable')
})

test('there are three states and no fourth', () => {
  assert.deepEqual(Object.keys(SIGN_IN_MESSAGES).sort(), ['code-mismatch', 'requested', 'unavailable'])
})

test('nothing in src or test refers to the withdrawn link', () => {
  // The names are assembled here so this file does not match itself; every
  // file under both directories is read, at every depth, this one included.
  const withdrawn = [['COMPLETION', 'PATH'].join('_'), ['stateOf', 'Return'].join(''), ['/sign-in', 'complete'].join('/')]
  const root = fileURLToPath(new URL('..', import.meta.url))
  let read = 0
  for (const dir of ['src', 'test']) {
    for (const entry of readdirSync(join(root, dir), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue
      const path = join(entry.parentPath, entry.name)
      const text = readFileSync(path, 'utf8')
      read += 1
      for (const name of withdrawn) {
        assert.ok(!text.includes(name), `${path} refers to ${name}`)
      }
    }
  }
  assert.ok(read > 0)
})

test('the gate holds an unknown session, answers an absent one, and passes a present one', () => {
  assert.equal(decide('unknown'), 'hold')
  assert.equal(decide('absent'), 'sign-in')
  assert.equal(decide('present'), 'through')
})
