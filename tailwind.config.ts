import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'
import { colorNames, darkVariables, lightVariables } from './src/design/tokens'

const colors = Object.fromEntries(
  colorNames.map((name) => [name, `rgb(var(--wa-${name}) / <alpha-value>)`]),
)

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'selector',
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        bubble: '0 1px 0.5px rgb(11 20 26 / 0.13)',
        popover:
          '0 2px 5px rgb(11 20 26 / 0.26), 0 2px 10px rgb(11 20 26 / 0.16)',
      },
      keyframes: {
        'typing-bounce': {
          '0%, 60%, 100%': { transform: 'translateY(0)' },
          '30%': { transform: 'translateY(-4px)' },
        },
        shimmer: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.45' } },
      },
      animation: {
        'typing-bounce': 'typing-bounce 1.2s infinite ease-in-out',
        shimmer: 'shimmer 1.4s infinite ease-in-out',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({ ':root': lightVariables, '.dark': darkVariables })
    }),
  ],
} satisfies Config
