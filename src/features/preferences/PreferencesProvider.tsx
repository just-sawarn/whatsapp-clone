import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { wallpapers } from '../../design/tokens'
import {
  PreferencesContext,
  defaultPreferences,
  type FontSize,
  type MessageSound,
  type Preferences,
  type PreferencesContextValue,
  type ThemeMode,
} from './PreferencesContext'

const storageKey = 'wa:preferences'
const rootFontSize: Record<FontSize, string> = { small: '15px', medium: '16px', large: '18px' }
const themes: ThemeMode[] = ['system', 'light', 'dark']
const fontSizes: FontSize[] = ['small', 'medium', 'large']
const sounds: MessageSound[] = ['off', 'chime', 'pop', 'ding']

function readPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return defaultPreferences
    const saved = JSON.parse(raw) as Partial<Preferences>
    return {
      theme: themes.includes(saved.theme as ThemeMode) ? (saved.theme as ThemeMode) : defaultPreferences.theme,
      fontSize: fontSizes.includes(saved.fontSize as FontSize) ? (saved.fontSize as FontSize) : defaultPreferences.fontSize,
      wallpaper: wallpapers.some((wallpaper) => wallpaper.id === saved.wallpaper) ? (saved.wallpaper as Preferences['wallpaper']) : defaultPreferences.wallpaper,
      messageSound: sounds.includes(saved.messageSound as MessageSound) ? (saved.messageSound as MessageSound) : defaultPreferences.messageSound,
      ringtone: typeof saved.ringtone === 'boolean' ? saved.ringtone : defaultPreferences.ringtone,
      sentSound: typeof saved.sentSound === 'boolean' ? saved.sentSound : defaultPreferences.sentSound,
      notificationBannerDismissed: saved.notificationBannerDismissed === true,
    }
  } catch {
    return defaultPreferences
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(readPreferences)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)
  const resolvedDark = preferences.theme === 'system' ? systemDark : preferences.theme === 'dark'

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedDark)
    document.documentElement.style.fontSize = rootFontSize[preferences.fontSize]
  }, [preferences.fontSize, resolvedDark])

  const update = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch }
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // Storage can be unavailable (private mode); the preference still applies for this session.
      }
      return next
    })
  }, [])

  const value = useMemo<PreferencesContextValue>(() => ({ ...preferences, resolvedDark, update }), [preferences, resolvedDark, update])
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}
