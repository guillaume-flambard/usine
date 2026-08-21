import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
// Sans extension : `allowImportingTsExtensions` n'est pas activé et
// `vue-tsc` refuserait un chemin en `.ts`.
import { playwright } from '@vitest/browser-playwright'
import viteConfig from './vite.config'

// Two projects. The kernel, the reducer and the agents test without a
// browser; interface promises — the page that never scrolls, the keyboard,
// reduced motion — can only be checked in a real browser.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      root: fileURLToPath(new URL('./', import.meta.url)),
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            environment: 'node',
            include: [
              'src/**/*.{spec,test}.ts',
              'src/**/__tests__/**/*.{spec,test}.ts',
              // The relay is not in the application: it carries the key, and
              // it is tested with the rest or it is not tested at all.
              'services/**/*.{spec,test}.mjs',
            ],
            exclude: [
              ...configDefaults.exclude,
              'e2e/**',
              'spike/**',
              'src/**/*.browser.spec.ts',
            ],
          },
        },
        {
          extends: true,
          test: {
            name: 'browser',
            include: ['src/**/*.browser.spec.ts'],
            browser: {
              enabled: true,
              provider: playwright(),
              headless: true,
              // Fixed size: "the page never scrolls" is checked at a known
              // dimension, not at whatever the provider picks.
              viewport: { width: 1440, height: 900 },
              instances: [{ browser: 'chromium' }],
            },
          },
        },
      ],
    },
  }),
)
