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
            // One file at a time. These suites drive real iframes, real
            // workers and a replayed run whose pace is measured, not mocked:
            // run in parallel they starve each other and fail on budgets
            // instead of on behaviour. Serial is slower and it is honest.
            fileParallelism: false,
            browser: {
              enabled: true,
              provider: playwright(),
              headless: true,
              // The verify workflow shares a self-hosted runner with the deploy
              // timer and other CI, so a cold chromium launch can outrun the
              // 30s default and fail with "Failed to connect to the browser
              // session within the timeout" (a flake, not a real test failure).
              connectTimeout: 120_000,
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
