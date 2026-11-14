import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import viteConfig from './vite.config'

// Two projects: pure logic runs in node, interface promises run in a real
// browser.
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
            include: ['src/**/*.spec.ts'],
            exclude: [...configDefaults.exclude, 'src/**/*.browser.spec.ts'],
          },
        },
        {
          extends: true,
          // Measured on a cold cache (2026-11-14): Vite discovers `vue` late,
          // re-optimizes and reloads, and the test then runs against two Vue
          // instances, so Nuxt UI's `useHead()` finds no provide context.
          // Pre-bundling it up front is what Vite itself asks for in that
          // case ("add mentioned dependencies to optimizeDeps.include").
          optimizeDeps: {
            include: ['vue'],
          },
          test: {
            name: 'browser',
            include: ['src/**/*.browser.spec.ts'],
            browser: {
              enabled: true,
              provider: playwright(),
              headless: true,
              viewport: { width: 1440, height: 900 },
              instances: [{ browser: 'chromium' }],
            },
          },
        },
      ],
    },
  }),
)
