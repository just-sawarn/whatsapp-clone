import { createContext, useContext } from 'react'
import type { WallpaperId } from '../../design/tokens'

export type ThemeMode = 'system' | 'light' | 'dark'
export type FontSize = 'small' | 'medium' | 'large'
export type MessageSound = 'off' | 'chime' | 'pop' | 'ding'

export type Preferences = {
  theme: ThemeMode
  fontSize: FontSize
  wallpaper: WallpaperId
  messageSound: MessageSound
  ringtone: boolean
  sentSound: boolean
  notificationBannerDismissed: boolean
  /** Keep the unlocked encryption key on this device until the login expires, so a reload does not ask again. */
  stayUnlocked: boolean
  /** 0.1 to 1: how loud notification sounds and the call ringtone are. 1 is the loudest. */
  soundVolume: number
}

export const defaultPreferences: Preferences = {
  theme: 'system',
  fontSize: 'medium',
  wallpaper: 'doodle',
  messageSound: 'chime',
  ringtone: true,
  sentSound: false,
  notificationBannerDismissed: false,
  stayUnlocked: true,
  soundVolume: 1,
}

export type PreferencesContextValue = Preferences & {
  resolvedDark: boolean
  update: (patch: Partial<Preferences>) => void
}

export const PreferencesContext = createContext<
  PreferencesContextValue | undefined
>(undefined)

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext)
  if (!context)
    throw new Error('usePreferences must be used inside PreferencesProvider.')
  return context
}
