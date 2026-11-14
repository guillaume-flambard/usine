import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import vueDevTools from 'vite-plugin-vue-devtools'

/**
 * En développement, `/` mène à l'atelier.
 *
 * En production c'est l'hôte qui décide : `atelier.memolabs.dev` sert
 * `atelier.html` à sa racine, `usine.memolabs.dev` garde sa vitrine. Le serveur
 * de développement n'a qu'un hôte, donc la racine y redirige — sans quoi
 * ouvrir l'adresse évidente montrerait la vitrine et l'écran du produit se
 * cacherait derrière un chemin à retenir.
 *
 * Uniquement la racine nue : `/index.html` reste atteignable pour relire la
 * vitrine. Rien de ce qui est construit ne change.
 */
function atelierALaRacine(): Plugin {
  return {
    name: 'usine:atelier-a-la-racine',
    apply: 'serve',
    configureServer(serveur) {
      serveur.middlewares.use((requete, reponse, suivant) => {
        // Seulement la racine nue. `/index.html` reste atteignable, sans quoi
        // la vitrine deviendrait invisible en développement et on ne pourrait
        // plus relire ce qu'elle raconte.
        if (requete.url === '/') {
          reponse.statusCode = 302
          reponse.setHeader('location', '/atelier.html')
          reponse.end()
          return
        }
        suivant()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Devtools is a dev-time tool and it is not inert under test: unmounting a
  // component makes its hook read an app instance that is gone, which surfaces
  // as an unhandled rejection and fails a run whose assertions all passed.
  plugins: [
    vue(),
    ui(),
    ...(process.env.VITEST === undefined ? [vueDevTools(), atelierALaRacine()] : []),
  ],
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
      // Trois pages. Le cadre sablé est servi par nous, sous sa propre politique
      // de sécurité, et ne doit pas partager un document avec l'hôte — c'est
      // cette séparation qui évite d'assouplir la moindre politique.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        sandbox: fileURLToPath(new URL('./sandbox.html', import.meta.url)),
        // L'atelier, entrée de production depuis qu'il porte le produit.
        //
        // Il n'a pas d'hôte à lui dans cette image : le même nginx sert les
        // deux, et choisit le fichier de repli selon l'en-tête `Host`. Sur
        // `usine.memolabs.dev`, `/atelier.html` rend 404 — la vitrine est
        // publique, l'atelier ne l'est pas.
        atelier: fileURLToPath(new URL('./atelier.html', import.meta.url)),
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
