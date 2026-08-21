import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

const MESSAGE_ISOLEMENT =
  "Seul src/runtime/ parle au moteur de composition. Passez par l'API publique du noyau (src/runtime/noyau.ts)."

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
    // Toutes les extensions, pas seulement TypeScript : un fichier .mjs
    // échapperait sinon entièrement à la règle.
    files: ['**/*.{vue,js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
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
              message: MESSAGE_ISOLEMENT,
            },
            {
              name: 'cosmokit',
              message: MESSAGE_ISOLEMENT,
            },
          ],
          patterns: ['cordis/*', '@cordisjs/*'],
        },
      ],
      // `no-restricted-imports` ne voit ni `import()` ni `require()` :
      // sans ceci la règle a une porte de sortie.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression > Literal[value=/^(cordis|@cordisjs\\/|cosmokit)/]',
          message: MESSAGE_ISOLEMENT,
        },
        {
          selector:
            "CallExpression[callee.name='require'] > Literal[value=/^(cordis|@cordisjs\\/|cosmokit)/]",
          message: MESSAGE_ISOLEMENT,
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
    ignores: ['src/agents/libre.ts'],
    rules: {
      // `no-restricted-syntax` est déjà employé par la règle d'isolement
      // du moteur ; le redéclarer ici l'écraserait pour les mêmes fichiers.
      // `no-new-func` couvre `new Function` comme `Function(...)`.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },

  skipFormatting,
)
