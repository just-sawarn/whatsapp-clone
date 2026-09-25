import { useEffect, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, LoaderCircle, ShieldCheck, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { createProfile, isUsernameAvailable } from '../../lib/profile'

type OnboardingData = { displayName: string; username: string; about: string }
type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
const storageKey = 'whatsapp-clone:onboarding'
const initialData: OnboardingData = { displayName: '', username: '', about: 'Hey there! I am using WhatsApp clone.' }

export default function OnboardingPage() {
  const { user, initializeEncryption, signOut } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(() => Number(localStorage.getItem(`${storageKey}:step`) ?? 0))
  const [data, setData] = useState<OnboardingData>(() => {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return initialData
    try { return { ...initialData, ...(JSON.parse(saved) as Partial<OnboardingData>) } } catch { return initialData }
  })
  const [availability, setAvailability] = useState<Availability>('idle')
  const [saving, setSaving] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(data))
    localStorage.setItem(`${storageKey}:step`, String(step))
  }, [data, step])

  useEffect(() => {
    const username = data.username.toLowerCase()
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      setAvailability(username.length === 0 ? 'idle' : 'invalid')
      return
    }
    setAvailability('checking')
    const timer = window.setTimeout(() => {
      void isUsernameAvailable(username)
        .then((available) => setAvailability(available ? 'available' : 'taken'))
        .catch(() => setAvailability('idle'))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [data.username])

  function update(field: keyof OnboardingData, value: string) {
    setData((current) => ({ ...current, [field]: value }))
    setError(null)
  }

  function next() {
    if (step === 0 && data.displayName.trim().length < 1) {
      setError('Add a display name to continue.')
      return
    }
    if (step === 1 && availability !== 'available') {
      setError('Choose an available username using 3 to 20 lowercase letters, numbers, or underscores.')
      return
    }
    setError(null)
    setStep((current) => Math.min(current + 1, 3))
  }

  function back() {
    setError(null)
    setStep((current) => Math.max(current - 1, 0))
  }

  async function finish(event: FormEvent) {
    event.preventDefault()
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      if (password.length < 6) {
        setError('Enter your account password so this device can create its private encryption key.')
        return
      }
      const encryptionReady = await initializeEncryption(password)
      if (!encryptionReady) {
        setError('We could not unlock encryption with that password. Check it and try again.')
        return
      }
      await createProfile({ id: user.id, username: data.username.toLowerCase(), displayName: data.displayName.trim(), about: data.about.trim() })
      localStorage.removeItem(storageKey)
      localStorage.removeItem(`${storageKey}:step`)
      navigate('/', { replace: true })
    } catch (profileError: unknown) {
      setError(profileError instanceof Error ? profileError.message : 'Unable to save your profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="onboarding-page">
      <motion.section className="onboarding-card" aria-labelledby="onboarding-title" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 280, damping: 24 }}>
        <div className="onboarding-progress"><span>Step {step + 1} of 4</span><div><i style={{ width: `${((step + 1) / 4) * 100}%` }} /></div></div>
        {step === 0 && <><div className="onboarding-icon"><UserRound size={28} /></div><h1 id="onboarding-title">Make it yours</h1><p className="onboarding-copy">Choose the name people will see when they message you.</p><label className="onboarding-label">Display name<input autoFocus value={data.displayName} maxLength={80} onChange={(event) => update('displayName', event.target.value)} placeholder="Your name" /></label><div className="profile-preview"><span className="preview-avatar">{data.displayName.trim().slice(0, 1).toUpperCase() || 'W'}</span><div><strong>{data.displayName || 'Your name'}</strong><span>Hey there! I am using WhatsApp clone.</span></div></div></>}
        {step === 1 && <><div className="onboarding-icon"><span>@</span></div><h1 id="onboarding-title">Pick a username</h1><p className="onboarding-copy">People can find you by this unique handle.</p><label className="onboarding-label">Username<div className="username-input"><span>@</span><input autoFocus value={data.username} maxLength={20} onChange={(event) => update('username', event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="your_handle" /></div></label><div className={`availability ${availability}`}>{availability === 'checking' && <LoaderCircle size={15} className="spin" />}{availability === 'available' && <Check size={15} />}{availability === 'available' ? `@${data.username} is available` : availability === 'taken' ? 'That username is already taken' : availability === 'invalid' ? 'Use 3 to 20 lowercase characters' : availability === 'checking' ? 'Checking availability...' : 'Your username is private to your account until you share it.'}</div></>}
        {step === 2 && <><div className="onboarding-icon"><ShieldCheck size={28} /></div><h1 id="onboarding-title">A little about you</h1><p className="onboarding-copy">This short note appears on your profile.</p><label className="onboarding-label">About<input autoFocus value={data.about} maxLength={140} onChange={(event) => update('about', event.target.value)} /></label><div className="security-note"><ShieldCheck size={18} /><span>Your messages will be end-to-end encrypted after the security setup phase.</span></div></>}
        {step === 3 && <><div className="onboarding-icon"><Check size={28} /></div><h1 id="onboarding-title">Ready when you are</h1><p className="onboarding-copy">Confirm your password once so this device can protect your messages locally. It is never stored.</p><label className="onboarding-label">Account password<input type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(null) }} placeholder="Your account password" minLength={6} required /></label><button className="permission-button" onClick={() => void Notification.requestPermission()} disabled={!('Notification' in window)}>Allow notifications</button><small className="permission-detail">Camera and microphone access will be requested only when you start a call.</small></>}
        {error && <div className="onboarding-error" role="alert">{error}</div>}
        <form onSubmit={finish} className="onboarding-actions">{step > 0 && <button type="button" className="back-button" onClick={back}><ChevronLeft size={17} /> Back</button>}{step < 3 ? <button type="button" className="next-button" onClick={next}>Continue <ChevronRight size={17} /></button> : <button type="submit" className="next-button" disabled={saving}>{saving ? 'Setting up...' : 'Open messages'}</button>}</form>
        <button className="onboarding-signout" onClick={() => void signOut()}>Sign out</button>
      </motion.section>
    </main>
  )
}
