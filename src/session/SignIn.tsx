import { useState, type FormEvent } from 'react'
import { requestLink } from './auth.ts'
import { SIGN_IN_MESSAGES, stateOfReturn, type SignInState } from './states.ts'

// The sign-in screen: one field for an address, one action. What follows a
// request never discloses whether the address has an account.

function SignIn() {
  const [state, setState] = useState<SignInState | undefined>(() => stateOfReturn(window.location.href))
  const [sending, setSending] = useState(false)

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending) return
    const email = String(new FormData(event.currentTarget).get('email') ?? '')
    setSending(true)
    setState(await requestLink(email))
    setSending(false)
  }

  return (
    <main className="screen">
      <header className="screen-header">
        <h1 className="screen-title">Sign in</h1>
      </header>

      <form className="entry-form" onSubmit={send}>
        <div className="form-required">
          <label className="field">
            <span className="field-label">Email address</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
        </div>

        <div aria-live="polite">
          {state && <p className="book-line">{SIGN_IN_MESSAGES[state]}</p>}
        </div>

        <nav className="screen-actions">
          <button className="action" type="submit" disabled={sending}>Send link</button>
        </nav>
      </form>
    </main>
  )
}

export default SignIn
