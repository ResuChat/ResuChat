import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'workers/index': 'src/workers/index.ts',
    'scripts/sync-drizzle-views': 'scripts/sync-drizzle-views.ts'
  },
  format: 'esm',
  platform: 'node',
  copy: ['fonts'],
  unbundle: true,
  dts: false,
  clean: true,
  sourcemap: true,
  fixedExtension: false,
  deps: {
    skipNodeModulesBundle: true
  }
})
