import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-*/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  // Isolement du noyau de composition : `cordis` ne s'importe que sous
  // `src/runtime/`. Le reste de l'application passe par son API publique.
  // C'est une règle, pas une convention : sans elle le paradigme s'érode
  // composant par composant.
  {
    name: 'app/isolement-du-runtime',
    files: ['**/*.{vue,ts,mts,tsx}'],
    // `spike/` est un banc de preuve hors application : il a le droit de
    // parler au moteur directement, c'est même sa raison d'être.
    ignores: ['src/runtime/**', 'spike/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'cordis',
              message:
                "Seul src/runtime/ importe cordis. Passez par l'API publique du noyau (src/runtime/noyau.ts).",
            },
          ],
          patterns: ['cordis/*'],
        },
      ],
    },
  },

  skipFormatting,
)
