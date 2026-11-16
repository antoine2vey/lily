import { configDefaults, defineConfig } from 'vitest/config'
import unit from './vitest.config'

export default defineConfig({
  ...unit,
  test: {
    ...unit.test,
    include: ['src/__tests__/integration/**/*.test.ts'],
    exclude: configDefaults.exclude,
    fileParallelism: false,
  },
})
