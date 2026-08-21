import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

const ISOLATION_MESSAGE =
  'Only src/runtime/ talks to the composition engine. Go through the kernel API (src/runtime/kernel.ts).'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-*/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  // Composition kernel isolation: `cordis` is only imported under
  // `src/runtime/`. The rest of the application goes through its public API.
  // This is a rule, not a convention: without it the paradigm erodes one
  // component at a time.
  {
    name: 'app/runtime-isolation',
    // Every extension, not just TypeScript: an .mjs file would otherwise
    // escape the rule entirely.
    files: ['**/*.{vue,js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
    // `spike/` is a proving ground outside the application: it is allowed to
    // talk to the engine directly — that is its whole purpose.
    ignores: ['src/runtime/**', 'spike/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'cordis',
              message: ISOLATION_MESSAGE,
            },
            {
              name: 'cosmokit',
              message: ISOLATION_MESSAGE,
            },
          ],
          patterns: ['cordis/*', '@cordisjs/*'],
        },
      ],
      // `no-restricted-imports` sees neither `import()` nor `require()`:
      // without this the rule has a way out.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression > Literal[value=/^(cordis|@cordisjs\\/|cosmokit)/]',
          message: ISOLATION_MESSAGE,
        },
        {
          selector:
            "CallExpression[callee.name='require'] > Literal[value=/^(cordis|@cordisjs\\/|cosmokit)/]",
          message: ISOLATION_MESSAGE,
        },
      ],
    },
  },

  // La fabrication par défaut ne doit jamais évaluer de code : sous une
  // politique de sécurité stricte, `unsafe-eval` est refusé. Seule la voie
  // par évaluation, cantonnée à un fichier, a le droit d'y toucher.
  {
    name: 'app/pas-devaluation-hors-agent-libre',
    files: ['src/**/*.{vue,ts,mts,tsx}'],
    ignores: ['src/agents/free-agent.ts'],
    rules: {
      // `no-restricted-syntax` is already used by the engine isolation rule;
      // redeclaring it here would override it for the same files.
      // `no-new-func` covers `new Function` as well as `Function(...)`.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },

  skipFormatting,
)
