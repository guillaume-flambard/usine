# Contribuer à l'usine

Merci de passer par ici. Ce guide dit comment démarrer, proposer une
modification et la faire vérifier. Il tient en une page ; le reste est dans le
[README](README.md) et dans [`docs/adr`](docs/adr).

## Démarrer en local

Il faut Node (la version de `.nvmrc`) avec pnpm, Python avec
[uv](https://docs.astral.sh/uv/), Docker, et
[gitleaks](https://github.com/gitleaks/gitleaks) pour les hooks git.

```sh
pnpm install && uv sync   # Node (apps/web) et Python (services/api)
cp .env.example .env      # puis renseigner POSTGRES_PASSWORD
docker compose up -d --wait
pnpm dev                  # http://localhost:5173, /api proxifié vers le port 8000
```

Sans passerelle de modèles configurée, l'interface le dit et rejoue un run
enregistré : on peut travailler sur le front sans aucune clé.

## Proposer une modification

1. Forkez le dépôt, puis créez une branche courte depuis `main`.
2. Faites un changement par sujet, avec ses tests.
3. Ouvrez une pull request vers `main` : dites ce qui change, pourquoi, et
   comment vous l'avez vérifié.

Pour une idée plus large qu'une correction, ouvrez d'abord un ticket : on se
met d'accord sur la direction avant le code.

## Les conventions

- **Commits** au format [Conventional Commits](https://www.conventionalcommits.org/fr/),
  avec la partie touchée en portée : `feat(web): …`, `fix(api): …`,
  `docs: …`. Le corps explique le pourquoi.
- **Langues** : le code, ses commentaires et les messages de commit sont en
  anglais ; l'interface, la narration et les consignes envoyées aux modèles sont
  en français.
- **Format** : Prettier pour `apps/web` (`pnpm format`), ruff pour
  `services/api` (`pnpm format:api`).
- **Interface** : chaque élément affiché vient d'un vrai événement de run, et
  une action qui sort du système passe toujours par la porte humaine. Les
  règles de design sont dans [`apps/web/DESIGN.md`](apps/web/DESIGN.md).
- **Secrets** : aucun dans le dépôt. Une variable d'environnement se désigne
  par son nom, jamais par sa valeur.

## Faire vérifier ses changements

```sh
pnpm test:all         # tests du front (node et navigateur) et de l'API
pnpm e2e              # bout en bout : vraie page, vraie API, modèles scriptés
./scripts/verify.sh   # la liste complète, celle qui garde la mise en ligne
```

Les hooks git ([lefthook](lefthook.yml)) lancent le formatage, ruff et
gitleaks au commit, et `verify.sh` au push. La même liste est rejouée par le
projet avant toute mise en ligne.

## Signaler un problème ou poser une question

Ouvrez un [ticket GitHub](https://github.com/guillaume-flambard/usine/issues)
avec ce que vous avez fait, ce que vous attendiez et ce qui s'est passé. Pour
une faille de sécurité, n'ouvrez pas de ticket public : écrivez à
contact@memolabs.dev.
