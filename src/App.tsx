import { useEffect, useState, type FormEvent } from 'react'
import { authenticate, getProtectedResource, type AuthMode } from './auth'
import { readAuthToken, removeAuthToken, saveAuthToken } from './tokenStorage'

type Notice = { kind: 'success' | 'error'; text: string } | null

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function formatResource(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? 'No data returned.'
}

function App() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [token, setToken] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [welcome, setWelcome] = useState<unknown>(null)
  const [profile, setProfile] = useState<unknown>(null)
  const [accountLoading, setAccountLoading] = useState(false)
  const [accountError, setAccountError] = useState('')

  const isSignup = mode === 'signup'

  useEffect(() => {
    let active = true

    readAuthToken()
      .then(savedToken => {
        if (active) setToken(savedToken)
      })
      .catch(error => {
        if (active) setNotice({ kind: 'error', text: `Could not restore your sign-in. ${errorText(error)}` })
      })
      .finally(() => {
        if (active) setAuthLoading(false)
      })

    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!token) return

    let active = true
    setAccountLoading(true)
    setAccountError('')

    Promise.allSettled([
      getProtectedResource('/api/welcome', token),
      getProtectedResource('/api/user/profile', token),
    ]).then(([welcomeResult, profileResult]) => {
      if (!active) return

      const failures: string[] = []
      if (welcomeResult.status === 'fulfilled') setWelcome(welcomeResult.value)
      else failures.push(errorText(welcomeResult.reason))
      if (profileResult.status === 'fulfilled') setProfile(profileResult.value)
      else failures.push(errorText(profileResult.reason))
      setAccountError(failures.join(' '))
      setAccountLoading(false)
    })

    return () => { active = false }
  }, [token])

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setNotice(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)

    const formData = new FormData(event.currentTarget)
    const fullName = String(formData.get('fullName') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    const confirmPassword = String(formData.get('confirmPassword') ?? '')

    if (isSignup && password !== confirmPassword) {
      setNotice({ kind: 'error', text: 'Those passwords do not match.' })
      return
    }

    setBusy(true)
    try {
      const result = await authenticate(mode, {
        ...(isSignup ? { fullName } : {}),
        email,
        password,
      })

      if (isSignup) {
        setMode('login')
        setNotice({ kind: 'success', text: 'Your account is ready. Sign in to continue.' })
      } else {
        if (!result.token) {
          throw new Error('Login succeeded, but no JWT was found in the response.')
        }
        await saveAuthToken(result.token)
        setToken(result.token)
      }
    } catch (error) {
      setNotice({
        kind: 'error',
        text: errorText(error),
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    try {
      await removeAuthToken()
      setToken(null)
      setWelcome(null)
      setProfile(null)
      setAccountError('')
      setMode('login')
      setNotice({ kind: 'success', text: 'You have been signed out.' })
    } catch (error) {
      setNotice({ kind: 'error', text: `Could not sign out safely. ${errorText(error)}` })
    }
  }

  return (
    <main className="auth-layout">
      <aside className="story-panel" aria-label="Account access">
        <div className="story-topline">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>ACCOUNT ACCESS</span>
        </div>

        <div className="story-copy">
          <p className="eyebrow">A GOOD PLACE TO BEGIN</p>
          <h1>Make room<br />for what&apos;s next.</h1>
          <p className="story-description">Your account is the first step back into your own space.</p>
        </div>

        <div className="story-art" aria-hidden="true">
          <div className="art-caption"><span>YOUR SPACE</span><span>01 / 01</span></div>
          <div className="art-rule" />
          <div className="art-note">
            <span className="note-kicker">A NOTE TO SELF</span>
            <span className="note-title">Start where<br />you are.</span>
            <span className="note-footer"><span className="note-dot" /> READY WHEN YOU ARE</span>
          </div>
          <span className="art-stamp">A</span>
        </div>

        <p className="story-footer">SIGN IN. SETTLE IN. MOVE FORWARD.</p>
      </aside>

      <section className="form-panel">
        <div className="mobile-brand"><span className="brand-mark" aria-hidden="true">A</span><span>ACCOUNT ACCESS</span></div>
        <div className="form-wrap">
          {authLoading ? (
            <p className="notice" role="status">Loading your account…</p>
          ) : token ? (
            <div className="account-view">
              <div className="account-heading">
                <div className="form-heading">
                  <p className="eyebrow">ACCOUNT OVERVIEW</p>
                  <h2>Your space, signed in.</h2>
                  <p className="form-subtitle">Your account details are up to date.</p>
                </div>
                <button className="logout-button" type="button" onClick={handleLogout}>Log out <span aria-hidden="true">↗</span></button>
              </div>
              {accountError && <p className="notice error" role="alert">{accountError}</p>}
              <section className="resource-panel" aria-labelledby="welcome-title">
                <h3 id="welcome-title">Welcome</h3>
                <pre className="resource-data">{accountLoading ? 'Loading…' : welcome === null ? 'No welcome message returned.' : formatResource(welcome)}</pre>
              </section>
              <section className="resource-panel" aria-labelledby="profile-title">
                <h3 id="profile-title">Your profile</h3>
                <pre className="resource-data">{accountLoading ? 'Loading…' : profile === null ? 'No profile returned.' : formatResource(profile)}</pre>
              </section>
            </div>
          ) : (
            <>
              <div className="form-heading">
                <p className="eyebrow">{isSignup ? 'YOUR NEXT CHAPTER' : 'WELCOME BACK'}</p>
                <h2>{isSignup ? 'Create your account' : 'Sign in to your space'}</h2>
                <p className="form-subtitle">{isSignup ? 'A few details and you’re all set.' : 'Pick up right where you left off.'}</p>
              </div>

              <div className="mode-switch" role="group" aria-label="Choose an account action">
                <button type="button" className={!isSignup ? 'mode-button active' : 'mode-button'} aria-pressed={!isSignup} onClick={() => switchMode('login')}>Sign in</button>
                <button type="button" className={isSignup ? 'mode-button active' : 'mode-button'} aria-pressed={isSignup} onClick={() => switchMode('signup')}>Create account</button>
              </div>

              <form className="auth-form" onSubmit={handleSubmit} key={mode}>
                {isSignup && (
                  <label className="field">
                    <span>Full name</span>
                    <input name="fullName" type="text" autoComplete="name" placeholder="Your name" required maxLength={100} />
                  </label>
                )}
                <label className="field">
                  <span>Email address</span>
                  <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input name="password" type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder="Enter your password" required minLength={isSignup ? 8 : undefined} />
                  {isSignup && <span className="field-hint">Use at least 8 characters.</span>}
                </label>
                {isSignup && (
                  <label className="field">
                    <span>Confirm password</span>
                    <input name="confirmPassword" type="password" autoComplete="new-password" placeholder="Enter it once more" required minLength={8} />
                  </label>
                )}

                {notice && (
                  <p className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
                    <span className="notice-mark" aria-hidden="true">{notice.kind === 'error' ? '!' : '✓'}</span>
                    {notice.text}
                  </p>
                )}

                <button className="submit-button" type="submit" disabled={busy}>
                  <span>{busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}</span>
                  <span className="submit-arrow" aria-hidden="true">↗</span>
                </button>
              </form>

              <p className="form-legal">By continuing, you agree to use this account responsibly.</p>
            </>
          )}
        </div>
        <footer className="form-footer"><span>SECURE ACCOUNT ACCESS</span><span>© {new Date().getFullYear()}</span></footer>
      </section>
    </main>
  )
}

export default App
