import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
// Sans extension : `allowImportingTsExtensions` n'est pas activé et
// `vue-tsc` refuserait un chemin en `.ts`.
import viteConfig from './vite.config'

// Fusionné avec la config Vite plutôt que redéclaré : deux définitions
// d'alias finiraient par diverger.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Le noyau ne touche ni au DOM ni à Vue : il se teste sans navigateur.
      environment: 'node',
      include: ['src/**/*.{spec,test}.ts', 'src/**/__tests__/**/*.{spec,test}.ts'],
      exclude: [...configDefaults.exclude, 'e2e/**', 'spike/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
