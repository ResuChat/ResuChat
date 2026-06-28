import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@resuchat/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url))
    }
  },
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
