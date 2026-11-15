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

### L'usine comme serveur MCP

L'usine expose ses primitives en MCP (MEM-39) : un client (Claude Code, Cursor,
l'inspecteur MCP) peut lister les runs, en ouvrir un, voir ses points de fork et
**ouvrir** une branche. Ouvrir, pas exécuter : `fork_run` demande à l'API une
branche amorcée mais arrêtée, et la porte humaine reste devant.

```sh
# stdio, pour un client local ; l'API doit tourner
uv run python -m usine_api.mcp_server

# ou en HTTP
USINE_MCP_TRANSPORT=streamable-http uv run python -m usine_api.mcp_server
```

Variables : `USINE_API_URL` (défaut `http://127.0.0.1:8000`),
`USINE_MCP_TRANSPORT` (`stdio` par défaut, ou `streamable-http`).

Configuration côté client (Claude Code, `~/.claude.json` ou le projet) :

```json
{
  "mcpServers": {
    "usine": {
      "command": "uv",
      "args": ["run", "python", "-m", "usine_api.mcp_server"],
      "cwd": "/chemin/vers/lab/services/usine/services/api",
      "env": { "USINE_API_URL": "http://127.0.0.1:8000" }
    }
  }
}
```

Outils exposés : `list_runs`, `get_run`, `list_checkpoints`, `list_specialists`
et `fork_run`. Leurs descriptions disent ce qu'ils font et leurs limites ;
`tests/test_mcp_server.py` les appelle contre l'API réelle en mémoire, et la
vérification par un client externe (`/mcp` dans Claude Code, ou l'inspecteur)
reste une manipulation à faire à la main : une imitation de client ne
prouverait rien de plus.

#### Authentification (MEM-40)

Le serveur MCP ne répond jamais sans jeton. Deux portées existent :

- `read` : lecture seule (`list_runs`, `get_run`, `list_checkpoints`,
  `list_specialists`) ;
- `read_fork` : lecture plus ouverture de branche (`fork_run`, qui n'exécute
  jamais une action irréversible : il ouvre une branche arrêtée).

Un jeton est révocable, étiqueté, et son hachage (jamais le jeton en clair) est
stocké dans la base (`mcp_tokens`, migration `0008`). Le jeton en clair n'est
rendu qu'au moment de sa création.

Créer un jeton (nécessite d'être connecté à l'API) :

```sh
curl -X POST http://127.0.0.1:8000/api/mcp/tokens \
  -H "Content-Type: application/json" \
  -d '{"label": "mon client", "scope": "read_fork"}'
```

Révoquer un jeton :

```sh
curl -X DELETE http://127.0.0.1:8000/api/mcp/tokens/<id>
```

Côté serveur MCP, le jeton s'injecte par variable d'environnement :

```sh
USINE_MCP_TOKEN=<le-jeton-en-clair> \
USINE_INTERNAL_SECRET=<cle-partagee-avec-l-api> \
uv run python -m usine_api.mcp_server
```

Variables : `USINE_API_URL` (défaut `http://127.0.0.1:8000`),
`USINE_MCP_TRANSPORT` (`stdio` par défaut, ou `streamable-http`),
`USINE_MCP_TOKEN`, `USINE_INTERNAL_SECRET`.

Configuration côté client (Claude Code, `~/.claude.json` ou le projet) :

```json
{
  "mcpServers": {
    "usine": {
      "command": "uv",
      "args": ["run", "python", "-m", "usine_api.mcp_server"],
      "cwd": "/chemin/vers/lab/services/usine/services/api",
      "env": {
        "USINE_API_URL": "http://127.0.0.1:8000",
        "USINE_MCP_TOKEN": "<le-jeton-en-clair>",
        "USINE_INTERNAL_SECRET": "<cle-partagee-avec-l-api>"
      }
    }
  }
}
```

L'authentification de ce serveur est MEM-40 : aujourd'hui il parle à une API
locale, protégé par un jeton porteur. Un appel sans jeton donne 401 ; un jeton
`read` ne peut pas forker (403). Chaque appel d'outil est journalisé (qui, quoi,
quand, aucun secret).
