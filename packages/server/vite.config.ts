import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  resolve: {
    alias: {
      '@resuchat/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url))
    }
  }
})
