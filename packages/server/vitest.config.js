/** @type {import('vitest/config').defineConfig} */
module.exports = {
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
};
