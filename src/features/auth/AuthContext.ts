import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type AuthContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
  authError: string | null
  clearError: () => void
  signIn: (email: string, password: string) => Promise<boolean>
  signUp: (email: string, password: string) => Promise<boolean>
  resetPassword: (email: string) => Promise<boolean>
  initializeEncryption: (password: string) => Promise<boolean>
  unlockEncryption: (password: string) => Promise<boolean>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}
