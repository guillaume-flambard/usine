import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), ui(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      // Two pages, not one. The sandboxed frame is served by us, under its own
      // security policy, and must not share a document with the host — that
      // separation is the reason no policy needs loosening.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        sandbox: fileURLToPath(new URL('./sandbox.html', import.meta.url)),
      },
    },
  },
  server: (process.env.VITEST === undefined
      ? {
          proxy: {
            '/api': {
              target: `http://127.0.0.1:${process.env.RELAY_PORT ?? 3111}`,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api/, ''),
            },
          },
        }
      : {}),
})
