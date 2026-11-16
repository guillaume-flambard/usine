# Usine

Un assistant qui enquête sur votre projet, et vous demande avant d'agir.

On lui pose une question sur un dépôt GitHub. Un agent chef découpe le travail,
plusieurs agents le font en parallèle avec de vrais outils (le serveur MCP
officiel de GitHub, en lecture seule), puis une synthèse rassemble ce qu'ils ont
trouvé. Si une action irréversible est proposée, par exemple ouvrir un ticket,
elle s'arrête devant une porte : une personne lit exactement ce qui partirait, et
décide.

- Le site : <https://usine.memolabs.dev>
- La visite, sans compte : <https://usine.memolabs.dev/visite> rejoue un vrai
  run enregistré, sans appeler de modèle.

## Comment c'est fait

```
question
  └─ superviseur ──┬─ agent ─┐
                   ├─ agent ─┼─ synthèse ─ porte humaine ─ action
                   └─ agent ─┘
```

- **Orchestration** : LangGraph. Chaque étape est un checkpoint en base, ce qui
  permet de reprendre un run, de revenir à une étape et d'en partir sur une
  autre branche. La porte est un `interrupt()`.
- **Agents** : LangChain v1, interchangeables derrière un même contrat.
- **Outils** : MCP. Les outils en lecture sont libres ; une écriture (ouvrir un
  ticket) devient une proposition, jamais un appel direct.
- **Modèles** : une passerelle LiteLLM ; le service ne lit aucune clé de
  fournisseur.
- **Interface** : Vue 3, Nuxt UI 4 et le Vercel AI SDK. Le flux d'événements
  d'un run est son format d'archive : un run exporté se rejoue à l'identique,
  sans modèle.

Deux limites, dites franchement :

- revenir en arrière restaure l'état de l'agent, pas le monde extérieur. Un
  ticket ouvert reste ouvert ; c'est pour ça que la porte est **avant** l'action ;
- l'usine ne prétend pas être une plateforme de fiabilité : elle tient une
  seule idée, voir et décider avant que ça parte.

## Démarrer

```sh
pnpm install && uv sync   # Node (apps/web) et Python (services/api)
cp .env.example .env      # puis renseigner POSTGRES_PASSWORD
docker compose up -d --wait
pnpm dev                  # http://localhost:5173, /api proxifié vers le port 8000
```

Sans passerelle de modèles configurée, l'interface le dit et rejoue un run
enregistré.

## Vérifier

```sh
pnpm test:all         # tests du front (node et navigateur) et de l'API
pnpm e2e              # bout en bout : vraie page, vraie API, modèles scriptés
./scripts/verify.sh   # la liste complète, celle qui garde la mise en ligne
```

Les hooks git (lefthook) lancent le formatage et la recherche de secrets au
commit, et `verify.sh` au push.

## L'usine comme serveur MCP

L'usine expose aussi ses propres runs en MCP : un client (Claude Code, Cursor,
l'inspecteur MCP) peut lister les runs, en ouvrir un, voir ses points de reprise
et ouvrir une branche. Ouvrir seulement : la branche est créée arrêtée, devant
la porte.

```sh
USINE_MCP_TOKEN=<jeton> USINE_INTERNAL_SECRET=<secret partagé avec l'API> \
  uv run python -m usine_api.mcp_server
```

Un jeton se crée depuis l'API (`POST /api/mcp/tokens`, portée `read` ou
`read_fork`) ; seul son hachage est stocké, et il se révoque. Sans jeton, le
serveur répond 401.

## Organisation du dépôt

| Dossier | Contenu |
|---|---|
| `apps/web` | l'interface (Vue 3, Vite, Nuxt UI 4) |
| `services/api` | le service FastAPI, le graphe LangGraph, les agents |
| `deployment` | comment le site est construit et servi |
| `docs/adr` | les décisions et leurs raisons |

Le code est en anglais ; l'interface, la narration et les consignes envoyées
aux modèles sont en français.
