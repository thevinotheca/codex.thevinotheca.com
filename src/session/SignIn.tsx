import { useState, type FormEvent } from 'react'
import { requestCode, verifyCode } from './auth.ts'
import { SIGN_IN_MESSAGES, type SignInState } from './states.ts'

// The sign-in screen, in two steps: an address and a request for a code;
// then the code, typed here, in the browser that will hold the record. What
// follows either step never discloses whether the address has an account.
// The code's format is guarded loosely: its length is not relied upon, and
// the provider alone decides whether it is valid.

function SignIn() {
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'address' | 'code'>('address')
  const [state, setState] = useState<SignInState | undefined>()
  const [busy, setBusy] = useState(false)

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const address = String(new FormData(event.currentTarget).get('email') ?? '').trim()
    setEmail(address)
    setBusy(true)
    const next = await requestCode(address)
    setState(next)
    if (next === 'requested') setStep('code')
    setBusy(false)
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const token = String(new FormData(event.currentTarget).get('code') ?? '').replace(/\s/g, '')
    if (!token) return
    setBusy(true)
    setState(await verifyCode(email, token))
    setBusy(false)
  }

  function back() {
    setState(undefined)
    setStep('address')
  }

  const message = (
    <div aria-live="polite">
      {state && <p className="book-line">{SIGN_IN_MESSAGES[state]}</p>}
    </div>
  )

  return (
    <main className="screen">
      <header className="screen-header">
        <h1 className="screen-title">Sign in</h1>
      </header>

      {step === 'address' ? (
        <form className="entry-form" onSubmit={send}>
          <div className="form-required">
            <label className="field">
              <span className="field-label">Email address</span>
              <input name="email" type="email" autoComplete="email" defaultValue={email} required />
            </label>
          </div>

          {message}

          <nav className="screen-actions">
            <button className="action" type="submit" disabled={busy}>Send code</button>
          </nav>
        </form>
      ) : (
        <form className="entry-form" onSubmit={verify}>
          <div className="form-required">
            <p className="book-line">{email}</p>
            <label className="field">
              <span className="field-label">Code</span>
              <input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoCapitalize="off"
                spellCheck={false}
                required
              />
            </label>
          </div>

          {message}

          <nav className="screen-actions">
            <button className="action" type="button" onClick={back} disabled={busy}>Change address</button>
            <button className="action" type="submit" disabled={busy}>Sign in</button>
          </nav>
        </form>
      )}
    </main>
  )
}

export default SignIn
