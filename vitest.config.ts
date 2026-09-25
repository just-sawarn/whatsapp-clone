import { defineConfig } from 'vitest/config'

// Unit tests only. The integration and browser suites need Docker (and Chrome) and run via scripts/test-*.sh.
export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/integration/**',
      'tests/e2e/**',
    ],
  },
})
