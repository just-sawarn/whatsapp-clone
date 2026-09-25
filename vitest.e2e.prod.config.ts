import { defineConfig } from 'vitest/config'

// The same browser suites, run against the production build served with the shipped security headers.
export default defineConfig({
  test: {
    include: ['tests/e2e/smoke.test.ts', 'tests/e2e/features.test.ts'],
    environment: 'node',
    globalSetup: ['tests/e2e/globalSetupProd.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
