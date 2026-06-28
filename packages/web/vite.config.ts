import { defineConfig, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig(({ mode }) => {
  const manualChunks = (id: string): string | undefined => {
    const normalizedId = id.replaceAll('\\', '/')
    if (normalizedId.includes('/node_modules/pdfjs-dist/')) return 'vendor-pdfjs'
    if (normalizedId.includes('/node_modules/element-plus/')) return 'vendor-element-plus'
    if (
      normalizedId.includes('/node_modules/ai/') ||
      normalizedId.includes('/node_modules/@ai-sdk/vue/')
    ) {
      return 'vendor-ai'
    }
    if (
      normalizedId.includes('/node_modules/marked/') ||
      normalizedId.includes('/node_modules/dompurify/')
    ) {
      return 'vendor-markdown'
    }
    return undefined
  }

  const plugins: PluginOption[] = [
    vue(),
    tailwindcss(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
      dts: true
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: true
    })
  ]

  if (mode === 'analyze') {
    plugins.push(
      visualizer({
        filename: 'dist/stats.html',
        template: 'treemap',
        gzipSize: true,
        brotliSize: true,
        open: false
      }) as PluginOption
    )
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@resuchat/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url))
      }
    },
    define: { global: 'globalThis' },
    build: {
      sourcemap: 'hidden',
      rolldownOptions: {
        output: {
          manualChunks
        }
      }
    },
    server: {
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        },
        '/avatars': {
          target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true
        },
        '/ws': {
          target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
          ws: true,
          changeOrigin: true
        }
      }
    }
  }
})
