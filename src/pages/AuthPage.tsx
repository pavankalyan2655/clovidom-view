import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useState, type FormEvent } from 'react'
import type { AuthMode } from '../auth'
import ArchitectureSlideshow from '../ArchitectureSlideshow'

export type AuthNotice = { kind: 'success' | 'error'; text: string } | null

interface AuthPageProps {
  mode: AuthMode
  busy: boolean
  notice: AuthNotice
  onModeChange: (mode: AuthMode) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onForgotPassword: () => void
}

const englishDisclaimer = 'Build trust, but never invest blindly. Verify every property, document, approval and legal detail independently before making an investment. This platform provides property information and enquiry support only. All detailed enquiries, property verification, legal checks and investment decisions are your responsibility.'
const teluguDisclaimer = 'నమ్మకంతో ముందుకు వెళ్లండి, కానీ పూర్తిగా పరిశీలించకుండా పెట్టుబడి పెట్టవద్దు. పెట్టుబడి చేసే ముందు ప్రతి ఆస్తి, పత్రం, అనుమతి మరియు చట్టపరమైన వివరాలను స్వయంగా ధృవీకరించుకోండి. ఈ ప్లాట్‌ఫారమ్ కేవలం ఆస్తుల సమాచారం మరియు విచారణకు సహాయం మాత్రమే అందిస్తుంది. పూర్తి వివరాల విచారణ, ఆస్తి ధృవీకరణ, చట్టపరమైన పరిశీలన మరియు పెట్టుబడి నిర్ణయాలు మీ బాధ్యత.'

export default function AuthPage({ mode, busy, notice, onModeChange, onSubmit, onForgotPassword }: AuthPageProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const reduceMotion = useReducedMotion()
  const isSignup = mode === 'signup'
  const transition = reduceMotion ? { duration: 0 } : { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const }

  return (
    <main className="cinematic-auth">
      <ArchitectureSlideshow className="auth-cinematic-image" showControls={false} />
      <div className="auth-cinematic-shade" aria-hidden="true" />

      <header className="cinematic-topbar">
        <a className="cinematic-brand" href="#" aria-label="Clovidom Estates">
          <img className="cinematic-brand-mark cinematic-brand-logo" src="/assets/branding/titleLogo.png" alt="" />
          <span>CLOVIDOM <i>ESTATES</i></span>
        </a>
        <span className="cinematic-location"><i /> HYDERABAD · INDIA</span>
      </header>

      <section className="auth-stage">
        <motion.div
          className="auth-glass-card"
          layout
          transition={{ layout: transition }}
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          aria-labelledby="auth-title"
        >
          <div className="glass-reflection" aria-hidden="true" />
          <div className="auth-card-brand">
            <img className="cinematic-brand-mark cinematic-brand-logo" src="/assets/branding/titleLogo.png" alt="" />
            <span className="auth-card-brand-text">A HIGHER WAY HOME</span>
          </div>
          <div className="auth-title-block">
            <p className="auth-eyebrow">{isSignup ? 'YOUR NEXT CHAPTER' : 'WELCOME BACK'}</p>
            <h1 id="auth-title">{isSignup ? 'Find your place.' : 'Come on in.'}</h1>
            <p>{isSignup ? 'Create an account to discover places worth calling home.' : 'Sign in to discover a place that feels like yours.'}</p>
          </div>

          <div className="auth-mode-tabs" role="group" aria-label="Choose an account action">
            <motion.span
              className="auth-mode-indicator"
              layout
              animate={{ x: isSignup ? '100%' : '0%' }}
              transition={transition}
              aria-hidden="true"
            />
            <button type="button" className={!isSignup ? 'selected' : ''} aria-pressed={!isSignup} onClick={() => onModeChange('login')}>Sign in</button>
            <button type="button" className={isSignup ? 'selected' : ''} aria-pressed={isSignup} onClick={() => onModeChange('signup')}>Create account</button>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.form
              key={mode}
              className="cinematic-auth-form"
              onSubmit={onSubmit}
              initial={{ opacity: 0, x: reduceMotion ? 0 : 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduceMotion ? 0 : -14 }}
              transition={transition}
            >
              {isSignup && (
                <>
                  <label className="cinematic-field">
                    <span>Full name</span>
                    <input name="fullName" autoComplete="name" placeholder="How should we address you?" required maxLength={100} />
                  </label>
                  <label className="cinematic-field">
                    <span>Phone number <small>OPTIONAL</small></span>
                    <input name="phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" maxLength={24} />
                  </label>
                </>
              )}
              <label className="cinematic-field">
                <span>Email address</span>
                <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} />
              </label>
              <label className="cinematic-field">
                <span>Password</span>
                <span className="cinematic-password">
                  <input name="password" type={showPassword ? 'text' : 'password'} autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder="Enter your password" required minLength={isSignup ? 8 : undefined} />
                  <button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'HIDE' : 'SHOW'}</button>
                </span>
                {isSignup && <small className="cinematic-hint">Use at least 8 characters.</small>}
              </label>
              {isSignup && (
                <label className="cinematic-field">
                  <span>Confirm password</span>
                  <span className="cinematic-password">
                    <input name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Enter it once more" required minLength={8} />
                    <button type="button" onClick={() => setShowConfirmPassword((shown) => !shown)} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}>{showConfirmPassword ? 'HIDE' : 'SHOW'}</button>
                  </span>
                </label>
              )}

              {!isSignup && (
                <div className="auth-utility-row">
                  <span>Protected with secure sign-in</span>
                  <button type="button" onClick={onForgotPassword}>Forgot password?</button>
                </div>
              )}

              <AnimatePresence initial={false}>
                {notice && (
                  <motion.p
                    className={`auth-notice ${notice.kind}`}
                    role={notice.kind === 'error' ? 'alert' : 'status'}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={transition}
                  >
                    {notice.text}
                  </motion.p>
                )}
              </AnimatePresence>

              <motion.button
                className="cinematic-submit"
                type="submit"
                disabled={busy}
                whileHover={reduceMotion ? undefined : { y: -2 }}
                whileTap={reduceMotion ? undefined : { scale: 0.99 }}
              >
                <span>{busy ? 'Please wait…' : isSignup ? 'Create your account' : 'Sign in to your account'}</span>
                <span aria-hidden="true">↗</span>
              </motion.button>
            </motion.form>
          </AnimatePresence>

          <p className="auth-card-footnote">By continuing, you agree to use this account responsibly.</p>
        </motion.div>
      </section>

      <footer className="cinematic-disclaimer">
        <details>
          <summary><span>INVEST WITH CARE</span><span className="disclaimer-toggle">Read disclaimer <i aria-hidden="true">＋</i></span></summary>
          <div className="disclaimer-copy">
            <p>{englishDisclaimer}</p>
            <p lang="te">{teluguDisclaimer}</p>
          </div>
        </details>
      </footer>
      <div className="cinematic-copyright">© {new Date().getFullYear()} CLOVIDOM ESTATES</div>
    </main>
  )
}
