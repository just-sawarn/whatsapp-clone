import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import {
  exportKeyBackup as exportBackup,
  getIdentityState,
  importKeyBackup as importBackup,
  initializeIdentity,
  lockIdentities,
  resetIdentity,
  rewrapIdentity,
  unlockStoredIdentity,
  type IdentityState,
} from '../../lib/crypto/keyStore'
import { clearCache } from '../../lib/messageCache'
import { getProfile, publishPublicKey, touchLastSeen } from '../../lib/profile'
import {
  AuthContext,
  type AuthContextValue,
  type SignUpResult,
} from './AuthContext'

function messageOf(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  return error instanceof Error ? error.message : fallback
}

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [identityState, setIdentityState] = useState<IdentityState | null>(null)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const userIdRef = useRef<string | undefined>(undefined)
  const userId = session?.user.id
  userIdRef.current = userId

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError(messageOf(error))
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
        setSession(nextSession)
        setLoading(false)
      },
    )
    return () => listener.subscription.unsubscribe()
  }, [])

  // On a fresh page load the key is not in memory: work out whether it is locked or missing.
  useEffect(() => {
    if (!userId) {
      setIdentityState(null)
      return
    }
    let active = true
    void getIdentityState(userId).then((state) => {
      if (active) setIdentityState(state)
    })
    return () => {
      active = false
    }
  }, [userId])

  /**
   * After a password sign-in: unlock the local key, or create one for a brand-new account. If the account
   * already has a profile but this device has no key, never mint a new one silently — that would strand
   * the messages sealed to the published key.
   */
  const prepareIdentity = useCallback(
    async (id: string, password: string): Promise<IdentityState> => {
      const state = await getIdentityState(id)
      if (state === 'locked') {
        try {
          await unlockStoredIdentity(id, password)
          return 'unlocked'
        } catch {
          return 'locked'
        }
      }
      if (state === 'missing') {
        try {
          if (await getProfile(id)) return 'missing'
          await initializeIdentity(id, password)
          return 'unlocked'
        } catch {
          return 'missing'
        }
      }
      return state
    },
    [],
  )

  const signIn = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setAuthError(null)
      if (!supabase) {
        setAuthError('Supabase is not configured.')
        return false
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setAuthError(messageOf(error))
        return false
      }
      if (data.user)
        setIdentityState(await prepareIdentity(data.user.id, password))
      return true
    },
    [prepareIdentity],
  )

  const signUp = useCallback(
    async (email: string, password: string): Promise<SignUpResult> => {
      setAuthError(null)
      if (!supabase) {
        setAuthError('Supabase is not configured.')
        return 'error'
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) {
        setAuthError(messageOf(error))
        return 'error'
      }
      if (!data.session || !data.user) return 'confirm-email'
      setIdentityState(await prepareIdentity(data.user.id, password))
      return 'signed-in'
    },
    [prepareIdentity],
  )

  const resendVerification = useCallback(
    async (email: string): Promise<boolean> => {
      setAuthError(null)
      if (!supabase) return false
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) setAuthError(messageOf(error))
      return !error
    },
    [],
  )

  const resetPassword = useCallback(async (email: string): Promise<boolean> => {
    setAuthError(null)
    if (!supabase) {
      setAuthError('Supabase is not configured.')
      return false
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) setAuthError(messageOf(error))
    return !error
  }, [])

  const completePasswordReset = useCallback(
    async (newPassword: string): Promise<boolean> => {
      setAuthError(null)
      if (!supabase) return false
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (error) {
        setAuthError(messageOf(error))
        return false
      }
      setRecoveryMode(false)
      return true
    },
    [],
  )

  const initializeEncryption = useCallback(
    async (password: string): Promise<boolean> => {
      setAuthError(null)
      const id = userIdRef.current
      if (!id) {
        setAuthError('Your session has expired. Sign in again to continue.')
        return false
      }
      try {
        await initializeIdentity(id, password)
        setIdentityState('unlocked')
        return true
      } catch (error) {
        setAuthError(
          error instanceof DOMException
            ? 'That password could not unlock the encryption key on this device.'
            : messageOf(error, 'Unable to initialize local encryption keys.'),
        )
        return false
      }
    },
    [],
  )

  const unlockEncryption = useCallback(
    async (password: string, newPassword?: string): Promise<void> => {
      const id = userIdRef.current
      if (!id)
        throw new Error('Your session has expired. Sign in again to continue.')
      try {
        if (!(await unlockStoredIdentity(id, password)))
          throw new Error('There is no encryption key on this device.')
      } catch (error) {
        if (error instanceof DOMException)
          throw new Error(
            'That password could not unlock the encryption key on this device.',
          )
        throw error
      }
      if (newPassword) await rewrapIdentity(id, password, newPassword)
      setIdentityState('unlocked')
    },
    [],
  )

  const resetEncryption = useCallback(
    async (password: string): Promise<void> => {
      const id = userIdRef.current
      if (!id)
        throw new Error('Your session has expired. Sign in again to continue.')
      const publicKey = await resetIdentity(id, password)
      await publishPublicKey(id, publicKey)
      setIdentityState('unlocked')
      await queryClient.invalidateQueries()
    },
    [queryClient],
  )

  const exportKeyBackup = useCallback(async (): Promise<string> => {
    const id = userIdRef.current
    if (!id)
      throw new Error('Your session has expired. Sign in again to continue.')
    return exportBackup(id)
  }, [])

  const importKeyBackup = useCallback(async (json: string): Promise<void> => {
    const id = userIdRef.current
    if (!id)
      throw new Error('Your session has expired. Sign in again to continue.')
    await importBackup(id, json)
    setIdentityState(await getIdentityState(id))
  }, [])

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<void> => {
      const client = requireClient()
      const current = session?.user
      if (!current?.email)
        throw new Error('Your session has expired. Sign in again to continue.')
      const { error: verifyError } = await client.auth.signInWithPassword({
        email: current.email,
        password: currentPassword,
      })
      if (verifyError) throw new Error('Your current password is not correct.')
      // Re-protect the local key first so a failure leaves the account password untouched.
      const state = await getIdentityState(current.id)
      if (state === 'locked' || state === 'unlocked') {
        try {
          await rewrapIdentity(current.id, currentPassword, newPassword)
        } catch {
          throw new Error(
            'Your encryption key on this device is protected by a different password. Unlock it in Settings → Security first.',
          )
        }
      }
      const { error } = await client.auth.updateUser({ password: newPassword })
      if (error) {
        if (state !== 'missing')
          await rewrapIdentity(current.id, newPassword, currentPassword).catch(
            () => undefined,
          )
        throw error
      }
    },
    [session],
  )

  const signOut = useCallback(async (): Promise<void> => {
    const id = userIdRef.current
    if (id) touchLastSeen(id)
    lockIdentities()
    if (id) await clearCache(id).catch(() => undefined)
    queryClient.clear()
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setAuthError(messageOf(error))
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      authError,
      clearError: () => setAuthError(null),
      identityState,
      recoveryMode,
      signIn,
      signUp,
      resendVerification,
      resetPassword,
      completePasswordReset,
      initializeEncryption,
      unlockEncryption,
      resetEncryption,
      exportKeyBackup,
      importKeyBackup,
      changePassword,
      signOut,
    }),
    [
      session,
      loading,
      authError,
      identityState,
      recoveryMode,
      signIn,
      signUp,
      resendVerification,
      resetPassword,
      completePasswordReset,
      initializeEncryption,
      unlockEncryption,
      resetEncryption,
      exportKeyBackup,
      importKeyBackup,
      changePassword,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
