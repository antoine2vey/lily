import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Per package: the shared workspace-root default races under parallel runs
    fsModuleCachePath: 'node_modules/.vitest-cache',
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    env: {
      MCP_SERVER_URL: 'http://localhost:3001',
    },
  },
})
