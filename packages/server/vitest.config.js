/** @type {import('vitest/config').defineConfig} */
module.exports = {
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    env: {
      JWT_SECRET: 'test-secret',
      DEEPSEEK_API_KEY: 'test-key',
      USE_REDIS: 'false'
    }
  }
}
