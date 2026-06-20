import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'workers/index': 'src/workers/index.ts'
  },
  format: 'esm',
  platform: 'node',
  unbundle: true,
  dts: false,
  clean: true,
  sourcemap: true,
  fixedExtension: false,
  deps: {
    skipNodeModulesBundle: true
  }
})
