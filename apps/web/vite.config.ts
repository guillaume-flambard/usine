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
  //
  // The identity "Le fil" (MEM-86) is light only: `colorMode: false` turns off
  // the @vueuse color mode, so the OS preference never adds `.dark`. Primary
  // and neutral are warm greys here; main.css points `--ui-primary` at the ink.
  plugins: [
    vue(),
    ui({
      prose: true,
      colorMode: false,
      ui: { colors: { primary: 'stone', neutral: 'stone' } },
      icon: { clientBundle: { scan: true } },
    }),
  ],
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
          // In production the same image serves the page and the API, so
          // these paths are same-origin there too (/auth for the Pocket ID
          // login, /health for the service's state).
          proxy: Object.fromEntries(
            ['/api', '/auth', '/health'].map((path) => [
              path,
              {
                target: `http://127.0.0.1:${process.env.USINE_API_PORT ?? 8000}`,
                changeOrigin: true,
              },
            ]),
          ),
        }
      : {},
})
