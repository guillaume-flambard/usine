## Why

**Priorité : P0 (cœur produit). Dépend de :** `import-external-traces` (livré).

C'est la vraie promesse de l'atelier appliquée à une trace réelle : aujourd'hui
une trace importée est rejouable et mesurable mais **non forkable** (aucun
`build.source`, AD-49). Sans re-exécution de l'agent étranger, le wahou
fork/hot-swap ne marche que sur les runs maison. Cette change lève la
restriction pour les traces importées, sous garde-fous stricts.

## What Changes

- **Runner d'agent étranger réseau-gated** : ré-exécuter un agent importé à
  partir d'un point N, dans un bac à sable dont les capacités réseau sont
  contrôlées (jamais un proxy ouvert ; un agent nomme une source/serveur
  d'outils, jamais une adresse — règle projet).
- **Checkpoint de reprise** : capturer l'état d'un agent étranger à N pour
  repartir sans rejouer tout depuis zéro.
- **Fork activé pour l'étranger** : une trace importée devient forkable une fois
  un runner disponible ; le bandeau « non forkable » disparaît alors.
- **BREAKING (comportement UI)** : la porte « Forker ce run » réapparaît pour une
  archive `foreign` **uniquement** quand un runner est configuré.

## Capabilities

### New Capabilities
- `foreign-agent-runner`: ré-exécuter un agent étranger à partir d'un checkpoint,
  réseau contrôlé, pour rendre une trace importée forkable.
- `agent-checkpoint`: capturer/restaurer l'état d'exécution d'un agent à un point
  N du flux.

## Impact

- **Frontière d'honnêteté (AD-41)** : le rollback reste intra-runtime — restaurer
  la composition, **jamais** les effets de bord externes déjà émis. On ne
  laisse jamais croire l'inverse ; se différencier sur « prévenir avant », pas
  « réparer après ».
- Sécurité forte : exécution de code d'origine externe → durcissement du bac à
  sable, quotas, isolation. Dépend de `security-hardening`.
- Gros chantier : probablement plusieurs changes filles (adaptateur d'état par
  framework : LangGraph d'abord).
