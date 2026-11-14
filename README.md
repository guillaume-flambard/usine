# usine

**Memo Labs — L'usine agentique.** Un besoin écrit en clair, et une usine qui
n'existe pas encore. Un modèle décide quels agents doivent exister ; ces agents
en créent d'autres, s'interrogent entre eux, écrivent le code de leurs outils et
le chargent à chaud. Une porte humaine tranche, puis le produit — une fonction
que personne n'avait nommée — s'exécute dans la page sur ce que vous tapez.

Sans clé branchée, le site rejoue des réponses préparées et le dit à l'écran :
un modèle est ce qui fait naître les agents, et rien ne prétend le contraire.

Le code est en anglais ; l'interface, la narration et les prompts sont en
français.

Planification : `_bmad-output/planning-artifacts/` (PRD, architecture, UX, epics).
Cadrage : `docs/`.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
pnpm install   # Node (apps/web)
uv sync        # Python (services/api, espace de travail uv)
```

### Compile and Hot-Reload for Development

```sh
pnpm dev
```

### Type-Check, Compile and Minify for Production

```sh
pnpm build
```

### Lint with [ESLint](https://eslint.org/)

```sh
pnpm lint
```

### Tests

```sh
pnpm --filter @usine/web exec playwright install chromium   # une fois, après un clone

pnpm test          # tests node du front
pnpm test:browser  # tests navigateur du front, dans un vrai Chromium
pnpm test:api      # tests Python de services/api (uv run pytest)
pnpm test:all      # les trois
```

Les promesses d'interface — la page qui ne défile jamais, le parcours critique
au clavier, aucun état porté par la seule couleur, le mouvement réduit — ne se
vérifient que dans un navigateur réel. Elles ont leur propre projet de tests.

### Déploiement

Les images v2 (`web`, `api`) sont reconstruites dans MEM-57 : il n'y a plus
d'image racine sur la branche `v2`. La chaîne réelle et la cible sont dans
`deployment/README.md`.

Voir `deployment/README.md`. La politique de sécurité servie autorise
`unsafe-eval` — et rien d'autre : les agents écrivent le code de leurs outils,
et ce code doit tourner. Le code est affiché avant de s'exécuter, la porte
humaine reste devant la livraison, et deux tests tiennent la politique.
