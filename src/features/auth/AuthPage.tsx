import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

type AuthMode = 'login' | 'signup' | 'reset'

export default function AuthPage() {
  const { authError, clearError, loading, user, signIn, signUp, resetPassword } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const title = mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'
  const submitLabel = mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Send reset link'

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true })
  }, [loading, navigate, user])

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode)
    setSuccessMessage(null)
    clearError()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setSuccessMessage(null)

    const succeeded = mode === 'login'
      ? await signIn(email, password)
      : mode === 'signup'
        ? await signUp(email, password)
        : await resetPassword(email)

    if (succeeded) {
      if (mode === 'signup') setSuccessMessage('Check your email to confirm your account.')
      if (mode === 'reset') setSuccessMessage('If that email exists, a reset link is on its way.')
    }
    setSubmitting(false)
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><span className="auth-logo"><LockKeyhole size={24} /></span><strong>Private messages</strong></div>
        <div className="auth-heading">
          <h1 id="auth-title">{title}</h1>
          <p>{mode === 'reset' ? 'We will send a secure link to your inbox.' : 'Simple, private conversations across your devices.'}</p>
        </div>
        <form onSubmit={handleSubmit}>
          <label><span>Email address</span><div className="auth-input"><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></div></label>
          {mode !== 'reset' && <label><span>Password</span><div className="auth-input"><LockKeyhole size={17} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required /></div></label>}
          {authError && <div className="auth-error" role="alert">{authError}</div>}
          {successMessage && <div className="auth-success" role="status">{successMessage}</div>}
          <button className="auth-submit" disabled={submitting}>{submitting ? 'Please wait...' : submitLabel}</button>
        </form>
        {mode === 'login' && <button className="auth-link" onClick={() => changeMode('reset')}>Forgot your password?</button>}
        {mode === 'reset' && <button className="auth-link back-link" onClick={() => changeMode('login')}><ArrowLeft size={15} /> Back to login</button>}
        {mode !== 'reset' && <p className="auth-switch">{mode === 'login' ? 'New here?' : 'Already have an account?'} <button onClick={() => changeMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Create an account' : 'Log in'}</button></p>}
        <div className="auth-footer"><ShieldCheck size={16} /> Your messages will be protected by Supabase Row Level Security.</div>
      </section>
    </main>
  )
}
