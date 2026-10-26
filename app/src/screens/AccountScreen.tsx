import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { errorMessage } from '../components/errorMessage.ts'
import SyncStatus from '../components/SyncStatus.tsx'
import { OfflineError } from '../sync/api.ts'
import { useSync } from '../sync/useSync.ts'

function AccountScreen() {
  const { hasServer, login } = useSync()
  return (
    <main className="screen">
      <Link className="back-link" to="/">
        ‹ Home
      </Link>
      <h1>Account</h1>
      {!hasServer && (
        <p className="card">This copy of the app isn't connected to a server, so your stats stay on this phone.</p>
      )}
      {hasServer && (login ? <LoggedIn /> : <LogInForm />)}
    </main>
  )
}

function LoggedIn() {
  const { login, phase, uploadNow, logOut } = useSync()
  return (
    <section className="card" aria-label="Your account">
      <p>
        Logged in as <strong>{login?.user.email}</strong>
      </p>
      <SyncStatus link={false} />
      <div className="button-row">
        <button className="button" type="button" onClick={uploadNow} disabled={phase === 'uploading'}>
          Upload now
        </button>
        <button className="button" type="button" onClick={logOut}>
          Log out
        </button>
      </div>
      <p className="muted">Logging out keeps everything on this phone. It uploads the next time you log in.</p>
    </section>
  )
}

function LogInForm() {
  const { logIn, problem } = useSync()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (mode === 'signup' && password.length < 8) {
      setError('Use a password of at least 8 characters')
      return
    }
    setBusy(true)
    try {
      await logIn(mode, email.trim(), password)
    } catch (err) {
      setError(err instanceof OfflineError ? "Can't reach the server. Check your connection and try again." : errorMessage(err))
      setBusy(false)
    }
  }

  const action = mode === 'login' ? 'Log in' : 'Create account'
  return (
    <form className="card" aria-label={action} onSubmit={handleSubmit}>
      {problem && <p className="form-error">{problem}</p>}
      <p>Log in to back up your stats to the server. Everything still works offline without an account.</p>
      <fieldset className="segmented segmented-2">
        <legend className="sr-only">Log in or make an account</legend>
        {(
          [
            ['login', 'Log in'],
            ['signup', 'New account'],
          ] as const
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="account-mode"
              checked={mode === value}
              onChange={() => {
                setMode(value)
                setError('')
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="field">
        Email
        <input
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="field">
        Password
        <input
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? 'One moment…' : action}
      </button>
    </form>
  )
}

export default AccountScreen
