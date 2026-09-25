import { Check } from 'lucide-react'
import { wallpapers } from '../../../design/tokens'
import { Icon } from '../../../components/ui/Icon'
import { cn } from '../../../lib/cn'
import {
  usePreferences,
  type FontSize,
  type ThemeMode,
} from '../../preferences/PreferencesContext'
import { SettingsCard, SettingsPanel } from '../SettingsPanel'

const themes: Array<{ id: ThemeMode; label: string }> = [
  { id: 'system', label: 'System default' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]
const sizes: Array<{ id: FontSize; label: string }> = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
]

function Choice({
  selected,
  onSelect,
  children,
}: {
  selected: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex items-center justify-between rounded-lg border px-4 py-2.5 text-left text-[15px] transition-colors',
        selected
          ? 'border-primary bg-primary/10'
          : 'border-divider hover:bg-surface-hover',
      )}
    >
      {children}
      {selected && <Icon icon={Check} size={18} className="text-link" />}
    </button>
  )
}

export function ChatsSection() {
  const { theme, fontSize, wallpaper, resolvedDark, update } = usePreferences()
  return (
    <SettingsPanel title="Chats">
      <SettingsCard title="Theme">
        <div role="radiogroup" aria-label="Theme" className="grid gap-2">
          {themes.map((item) => (
            <Choice
              key={item.id}
              selected={theme === item.id}
              onSelect={() => update({ theme: item.id })}
            >
              {item.label}
            </Choice>
          ))}
        </div>
      </SettingsCard>
      <SettingsCard title="Chat wallpaper">
        <div
          role="radiogroup"
          aria-label="Chat wallpaper"
          className="grid grid-cols-3 gap-3 sm:grid-cols-5"
        >
          {wallpapers.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={wallpaper === item.id}
              aria-label={item.label}
              onClick={() => update({ wallpaper: item.id })}
              className="grid gap-1.5 text-center"
            >
              <span
                className={cn(
                  'grid h-16 place-items-center rounded-lg border-2',
                  wallpaper === item.id ? 'border-primary' : 'border-divider',
                )}
                style={{
                  backgroundColor: resolvedDark ? item.dark : item.light,
                }}
              >
                {wallpaper === item.id && (
                  <Icon icon={Check} size={18} className="text-link" />
                )}
              </span>
              <span className="text-xs text-muted">{item.label}</span>
            </button>
          ))}
        </div>
      </SettingsCard>
      <SettingsCard title="Font size">
        <div role="radiogroup" aria-label="Font size" className="grid gap-2">
          {sizes.map((item) => (
            <Choice
              key={item.id}
              selected={fontSize === item.id}
              onSelect={() => update({ fontSize: item.id })}
            >
              {item.label}
            </Choice>
          ))}
        </div>
      </SettingsCard>
    </SettingsPanel>
  )
}
