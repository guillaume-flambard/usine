import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
// Sans extension : `allowImportingTsExtensions` n'est pas activé et
// `vue-tsc` refuserait un chemin en `.ts`.
import { playwright } from '@vitest/browser-playwright'
import viteConfig from './vite.config'

// Deux projets. Le noyau, le réducteur et les scénarios se testent sans
// navigateur ; les promesses d'interface — la page qui ne défile pas, le
// clavier, le mouvement réduit — ne se vérifient que dans un vrai navigateur.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      root: fileURLToPath(new URL('./', import.meta.url)),
      projects: [
        {
          extends: true,
          test: {
            name: 'noyau',
            environment: 'node',
            include: ['src/**/*.{spec,test}.ts', 'src/**/__tests__/**/*.{spec,test}.ts'],
            exclude: [...configDefaults.exclude, 'e2e/**', 'spike/**', 'src/**/*.navigateur.spec.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'navigateur',
            include: ['src/**/*.navigateur.spec.ts'],
            browser: {
              enabled: true,
              provider: playwright(),
              headless: true,
              instances: [{ browser: 'chromium' }],
            },
          },
        },
      ],
    },
  }),
)
