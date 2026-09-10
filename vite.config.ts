import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  // Devtools is a dev-time tool and it is not inert under test: unmounting a
  // component makes its hook read an app instance that is gone, which surfaces
  // as an unhandled rejection and fails a run whose assertions all passed.
  plugins: [vue(), ui(), ...(process.env.VITEST === undefined ? [vueDevTools()] : [])],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The console shell under `src/client` is vendored from
      // `@cordisjs/client` (MIT, cordiverse/webui). Its own files import
      // itself by package name. Keeping those specifiers intact, and
      // resolving them here, is what makes a later re-sync with upstream a
      // diff rather than a rewrite. Same reason for the component library.
      '@cordisjs/components': fileURLToPath(
        new URL('./src/client/vendor-components', import.meta.url),
      ),
      '@cordisjs/client': fileURLToPath(new URL('./src/client', import.meta.url)),
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
        // The vendored console shell, on its own page while it is being
        // dressed, so the shipped product keeps booting from `index.html`.
        console: fileURLToPath(new URL('./console.html', import.meta.url)),
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
