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
    //
    // `src/client/` is the console shell vendored from `@cordisjs/client`
    // (MIT, cordiverse/webui). It is cordis-aware by construction: its whole
    // job is to bind fibers and services to Vue. Listing it here is honest
    // about a second engine-facing layer; hiding it under `src/runtime/` to
    // satisfy the linter would not be. The rule's intent still holds for the
    // rest of the application, which keeps consuming the `RunEvent` stream.
    //
    // `src/shell/` is our own code, and it is here for the same reason: it
    // composes that shell, so it names cordis to register plugins and read
    // services. It stays in the strict TypeScript project, unlike the vendored
    // tree, precisely so the compiler keeps holding it to our standard.
    ignores: ['src/runtime/**', 'src/client/**', 'src/shell/**', 'spike/**'],
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

  // `src/client/` vient de `@cordisjs/client` (MIT, cordiverse/webui). Le
  // TypeScript, lui, est désormais tenu au standard du dépôt : le projet séparé
  // qui le jugeait plus doucement a été supprimé, parce qu'un même programme ne
  // peut pas avoir deux niveaux de sévérité dès que les deux moitiés se
  // parlent. Les 61 erreurs ont été payées.
  //
  // Restent éteintes ici des règles de STYLE, et elles seules : renommer 45
  // fichiers d'icônes ou retyper leurs registres dynamiques ne corrigerait
  // aucun défaut, et éloignerait le dossier de l'amont sans rien acheter.
  // `src/shell/`, qui est notre code, n'a droit à aucune de ces exemptions.
  //
  // Ce qui reste actif : tout ce qui attrape un défaut, pas un goût. Les règles
  // `vue/valid-v-for` et `vue/require-v-for-key` ont d'ailleurs trouvé cinq
  // `v-for` sans clé dans leur barre de menus, corrigés plutôt que tus.
  {
    name: 'app/coquille-vendorisee',
    files: ['src/client/**/*.{vue,js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
    rules: {
      // Leurs icônes sont un fichier par glyphe : `home.vue`, `moon.vue`.
      'vue/multi-word-component-names': 'off',
      // Leur transport et leur registre de composants sont typés larges.
      '@typescript-eslint/no-explicit-any': 'off',
      // `interface ActionContext {}` est une couture d'augmentation, voulue.
      '@typescript-eslint/no-empty-object-type': 'off',
      // `namespace Config` porte les types de l'interface qu'il fusionne.
      '@typescript-eslint/no-namespace': 'off',
      // Leurs gestionnaires de glisser-déposer déclarent `event` sans s'en
      // servir, et n'ont pas la convention du préfixe `_`.
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // L'évaluation du code écrit par un modèle est cantonnée au fil isolé, et à
  // lui seul. Elle a lieu là où l'on peut arrêter une boucle infinie et où les
  // capacités réseau et stockage ont été retirées — pas dans la page hôte, où
  // elle verrait le document, le stockage local et la route du relais.
  {
    name: 'app/pas-devaluation-hors-du-fil-isole',
    files: ['src/**/*.{vue,ts,mts,tsx}'],
    ignores: ['src/app/behaviour-worker.ts'],
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
