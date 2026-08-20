# usine

**Memo Labs — L'usine agentique.** Un système agentique qui, à partir d'un brief
métier, se compose lui-même : des agents et des outils se chargent, se câblent
par leurs dépendances déclarées, fabriquent des composants à l'exécution, passent
une porte humaine et livrent un produit fonctionnel — le tout visible en direct
sous forme de graphe, sans clé d'API et sans token.

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
pnpm install
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
pnpm exec playwright install chromium   # une fois, sur un dépôt fraîchement cloné

pnpm test            # le noyau, le réducteur, les scénarios — sans navigateur
pnpm test:navigateur # les promesses d'interface, dans un vrai Chromium
pnpm test:tout       # les deux
```

Les promesses d'interface — la page qui ne défile jamais, le parcours critique
au clavier, aucun état porté par la seule couleur, le mouvement réduit — ne se
vérifient que dans un navigateur réel. Elles ont leur propre projet de tests.

### Déploiement

```sh
docker build -t usine-agentique .
docker run --rm -p 8080:80 usine-agentique
```

Voir `deploiement/README.md`. La politique de sécurité servie est stricte,
sans `unsafe-eval` : le mode par défaut doit passer dessous, et un test de
non-régression le vérifie.
