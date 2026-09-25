import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { initializeIdentity, unlockStoredIdentity } from '../../lib/crypto/keyStore'
import { AuthContext, type AuthContextValue } from './AuthContext'

function getAuthErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError(getAuthErrorMessage(error))
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function runAuthAction(action: () => Promise<{ error: Error | null }>): Promise<boolean> {
    setAuthError(null)
    const { error } = await action()
    if (error) {
      setAuthError(getAuthErrorMessage(error))
      return false
    }
    return true
  }

  async function signIn(email: string, password: string): Promise<boolean> {
    setAuthError(null)
    if (!supabase) {
      setAuthError('Supabase is not configured.')
      return false
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthError(getAuthErrorMessage(error))
      return false
    }
    if (data.user) {
      try {
        await initializeIdentity(data.user.id, password)
      } catch (identityError: unknown) {
        setAuthError(identityError instanceof Error ? identityError.message : 'Unable to initialize local encryption keys.')
        return false
      }
    }
    return true
  }

  async function initializeEncryption(password: string): Promise<boolean> {
    setAuthError(null)
    if (!session?.user) {
      setAuthError('Your session has expired. Sign in again to continue.')
      return false
    }
    try {
      await initializeIdentity(session.user.id, password)
      return true
    } catch (identityError: unknown) {
      setAuthError(identityError instanceof Error ? identityError.message : 'Unable to initialize local encryption keys.')
      return false
    }
  }

  async function unlockEncryption(password: string): Promise<boolean> {
    setAuthError(null)
    if (!session?.user) return false
    try {
      return await unlockStoredIdentity(session.user.id, password)
    } catch (identityError: unknown) {
      setAuthError(identityError instanceof Error ? identityError.message : 'The password could not unlock this device.')
      return false
    }
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    authError,
    clearError: () => setAuthError(null),
    signIn,
    signUp: (email, password) => runAuthAction(() => supabase ? supabase.auth.signUp({ email, password }) : Promise.resolve({ error: new Error('Supabase is not configured.') })),
    resetPassword: (email) => runAuthAction(() => supabase ? supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }) : Promise.resolve({ error: new Error('Supabase is not configured.') })),
    initializeEncryption,
    unlockEncryption,
    signOut: async () => {
      if (!supabase) return
      const { error } = await supabase.auth.signOut()
      if (error) setAuthError(getAuthErrorMessage(error))
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
