import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Per package: the shared workspace-root default races under parallel runs
    fsModuleCachePath: 'node_modules/.vitest-cache',
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
})
