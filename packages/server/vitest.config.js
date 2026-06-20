import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    env: {
      JWT_SECRET: 'test-secret',
      DEEPSEEK_API_KEY: 'test-key',
      USE_REDIS: 'false'
    }
  }
})
