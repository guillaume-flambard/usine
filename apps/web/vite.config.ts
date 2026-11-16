import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'

// https://vite.dev/config/
export default defineConfig({
  // Icons are bundled, never fetched: without a local collection, Iconify
  // calls api.iconify.design at runtime, which the page's policy
  // (connect-src 'self') blocks, so the buttons lost their icons. `scan`
  // adds the icons the app names itself (i-lucide-history…).
  plugins: [vue(), ui({ icon: { clientBundle: { scan: true } } })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server:
    process.env.VITEST === undefined
      ? {
          // The API is served by services/api (FastAPI). The provider key lives
          // there and never reaches the browser.
          proxy: {
            '/api': {
              target: `http://127.0.0.1:${process.env.USINE_API_PORT ?? 8000}`,
              changeOrigin: true,
            },
          },
        }
      : {},
})
