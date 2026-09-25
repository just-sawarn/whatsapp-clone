/**
 * Single source of truth for the WhatsApp-style palette. Tailwind reads the names from here and a
 * base-layer plugin emits them as CSS variables, so components use `bg-panel`, `text-muted`, etc.
 * and never hard-code a hex value. Values are space-separated RGB channels for alpha support.
 */
export type ColorTokens = Record<string, string>

function rgb(hex: string): string {
  const value = hex.replace('#', '')
  return [0, 2, 4]
    .map((start) => parseInt(value.slice(start, start + 2), 16))
    .join(' ')
}

const light = {
  primary: '#00A884',
  'primary-strong': '#008F72',
  accent: '#25D366',
  link: '#008069',
  'app-bg': '#D1D7DB',
  'chat-bg': '#EFEAE2',
  panel: '#F0F2F5',
  surface: '#FFFFFF',
  'surface-hover': '#F5F6F6',
  'bubble-out': '#D9FDD3',
  'bubble-in': '#FFFFFF',
  text: '#111B21',
  muted: '#667781',
  divider: '#E9EDEF',
  'tick-blue': '#53BDEB',
  danger: '#EA0038',
  'danger-soft': '#FFF0EF',
  warning: '#FFF5C4',
  'warning-strong': '#F5A623',
  'input-bg': '#F0F2F5',
  overlay: '#111B21',
} satisfies ColorTokens

const dark = {
  primary: '#005C4B',
  'primary-strong': '#00735C',
  accent: '#25D366',
  link: '#00A884',
  'app-bg': '#0B141A',
  'chat-bg': '#0B141A',
  panel: '#202C33',
  surface: '#111B21',
  'surface-hover': '#202C33',
  'bubble-out': '#005C4B',
  'bubble-in': '#202C33',
  text: '#E9EDEF',
  muted: '#8696A0',
  divider: '#2A3942',
  'tick-blue': '#53BDEB',
  danger: '#F15C6D',
  'danger-soft': '#3B2024',
  warning: '#182B31',
  'warning-strong': '#F5A623',
  'input-bg': '#2A3942',
  overlay: '#000000',
} satisfies ColorTokens

export const colorNames = Object.keys(light)
export const lightVariables = Object.fromEntries(
  Object.entries(light).map(([name, hex]) => [`--wa-${name}`, rgb(hex)]),
)
export const darkVariables = Object.fromEntries(
  Object.entries(dark).map(([name, hex]) => [`--wa-${name}`, rgb(hex)]),
)

/** Curated chat wallpapers (v1 does not accept arbitrary uploads). */
export const wallpapers = [
  { id: 'doodle', label: 'Doodle', light: '#EFEAE2', dark: '#0B141A' },
  { id: 'mint', label: 'Mint', light: '#DDF3EA', dark: '#0E1F1B' },
  { id: 'sand', label: 'Sand', light: '#F3E9D8', dark: '#1C1A14' },
  { id: 'sky', label: 'Sky', light: '#DCE9F5', dark: '#0F1A24' },
  { id: 'plain', label: 'Plain', light: '#FFFFFF', dark: '#111B21' },
] as const

export type WallpaperId = (typeof wallpapers)[number]['id']

/** Decorative colours for initials avatars, chosen for white-text contrast in both themes. */
export const avatarPalette = [
  '#00A884',
  '#5E7CE2',
  '#C0468A',
  '#D6772B',
  '#7D5BA6',
  '#2B8CA3',
  '#B0523C',
  '#4F8A4B',
] as const

/** Background colours for text statuses. */
export const statusPalette = [
  '#128C7E',
  '#7E57C2',
  '#C2185B',
  '#E65100',
  '#1565C0',
  '#2E7D32',
  '#455A64',
  '#6D4C41',
] as const
