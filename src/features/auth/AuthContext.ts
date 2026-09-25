import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { IdentityState } from '../../lib/crypto/keyStore'

export type SignUpResult = 'signed-in' | 'confirm-email' | 'error'

export type AuthContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
  authError: string | null
  clearError: () => void
  /** State of this device's encryption key; null until it has been checked. */
  identityState: IdentityState | null
  /** True after the user opened a password-reset link and must choose a new password. */
  recoveryMode: boolean
  signIn: (email: string, password: string) => Promise<boolean>
  signUp: (email: string, password: string) => Promise<SignUpResult>
  resendVerification: (email: string) => Promise<boolean>
  resetPassword: (email: string) => Promise<boolean>
  completePasswordReset: (newPassword: string) => Promise<boolean>
  /** Creates (or unlocks) this device's key; used by onboarding. */
  initializeEncryption: (password: string) => Promise<boolean>
  /** Unlocks the key with the password that protects it, optionally re-protecting it under a new password. Throws on failure. */
  unlockEncryption: (password: string, newPassword?: string) => Promise<void>
  /** Generates a brand-new key and publishes it. Old messages become unreadable. Throws on failure. */
  resetEncryption: (password: string) => Promise<void>
  exportKeyBackup: () => Promise<string>
  importKeyBackup: (json: string) => Promise<void>
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}
