/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Public address of the app (for email links and invite links). Defaults to the current address. */
  readonly VITE_APP_URL?: string
  /** Public VAPID key for Web Push (optional). */
  readonly VITE_VAPID_PUBLIC_KEY?: string
  /** Optional TURN relay for calls behind strict NATs. */
  readonly VITE_TURN_URL?: string
  readonly VITE_TURN_USERNAME?: string
  readonly VITE_TURN_CREDENTIAL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
