# Addendum — L'usine agentique

Profondeur technique et rationnels sortis du PRD parce qu'ils appartiennent à l'architecture ou à la conception de solution, pas au PRD lui-même. À consommer par `bmad-architecture` et `bmad-ux`.

## Mécanisme retenu : Cordis comme noyau de composition

`@cordisjs` est le moteur validé le 2026-08-20 (Node v24, 3 paquets, ~2 s d'installation). L'API réelle correspond au papier : `ctx.plugin / effect / set / get / inject`, exports `Fiber / FiberState / Inject / Service`.

Preuve exécutée : un composant ouvre une ressource via `ctx.effect(() => { …; return () => …undo… })` ; `fiber.dispose()` la referme automatiquement, en ordre inverse. Spawn et kill à chaud avec réversion propre sont donc acquis. Fichiers : `scratchpad/cordis-test/demoA.mjs`.

Le coeffect réactif, noté « reste à câbler » dans `docs/2-EXECUTION.md`, est **prouvé depuis le 2026-08-20** : les métadonnées `provide` / `inject` du plugin suffisent. L'agent attend en `PENDING`, s'active seul à l'arrivée de sa dépendance, se désactive seul à son départ, se réactive à son retour. Voir `spike-cordis-navigateur.md`.

Contrat de composant visé :
- `inject` — ce dont le composant a besoin ; il ne s'active que lorsque tout est fourni.
- `provide` — ce qu'il expose (un outil, une capacité, un résultat).
- `apply` — ce qu'il installe au chargement, et son inverse au déchargement.

Conséquences directes : l'agent maître spawn via `ctx.plugin(component)` et obtient une fiber ; le décharger cascade sur tout ce qu'il a créé ; la topologie de coeffects *est* le graphe affiché ; HMR permet le remplacement à chaud d'un composant généré, donc le rollback propre d'une auto-modification ratée.

Versions : `cordis@4.0.0-rc.8` est installé dans le projet et vérifié. `@cordisjs/loader` et `@cordisjs/plugin-hmr`, relevés dans `docs/2-EXECUTION.md`, ne sont ni installés ni testés — le HMR reste à prouver. `cordis` est en release candidate et peut bouger.

## Question de transport — close

Cordis se bundle sous Vite et tourne dans le navigateur. Mesuré le 2026-08-20 dans Chrome : treize vérifications sur treize, aucune API native de Node dans le bundle, 11,4 ko gzip. **Aucun repli n'est nécessaire** — ni Web Worker, ni service Node. Le moteur reste client-only, donc NFR-005 et NFR-006 tiennent.

Les deux replis envisagés sont abandonnés et conservés ici pour mémoire : isolation dans un Web Worker avec messages typés ; petit service Node dédié, qui aurait coûté l'hébergement statique.

## La contrainte CSP, découverte par le spike

`new Function` échoue sous `Content-Security-Policy: default-src 'self'`. La fabrication de composant à l'exécution emprunte donc deux voies distinctes :

- **Par composition de primitives** — un compilateur prend une spécification et assemble des primitives existantes en un composant. Passe sous CSP stricte. C'est la voie par défaut de FR-052.
- **Par évaluation de code** — `new Function` sur une source produite à l'exécution. Exige `unsafe-eval`. Réservée au mode LLM branché, où une spécification réellement imprévue le justifie, et à poser comme arbitrage explicite (NFR-023).

L'architecture doit garder les deux voies derrière la même interface de fabrication, pour que le choix reste un réglage et non une réécriture.

## Conflit de stack tranché

`docs/2-EXECUTION.md` décrit un front Next.js / React / Tailwind. `docs/0-DECISIONS.md` décrit Vue 3 + TypeScript + Vite, et déclare primer sur les autres documents. Le dépôt est effectivement scaffoldé en Vue via `create-vue`, avec pnpm, ESLint/oxlint, Prettier et TypeScript strict.

Décision : **Vue 3 + Vite**. `docs/2-EXECUTION.md` est périmé sur ce point et devrait être corrigé pour éviter que l'erreur ne se propage.

## Ce qui est repris de l'existant

`src/usine/run.ts` (1252 lignes) est un run choréographié par timers, porté depuis un artefact Open Design. Il est abandonné comme moteur, mais il contient trois choses à récupérer :

1. **La géométrie et le vocabulaire du graphe** — définitions de nœuds avec position, libellé, technologie, rôle, et le tracé d'arêtes courbes. Réutilisable comme base de la disposition automatique.
2. **Le moteur de règles du vérificateur d'allégations** — structure `ClaimRules` avec expressions interdites, expressions à vérifier, et expressions autorisées portant chacune sa source et son document. C'est le cœur du payoff réel et il est déjà déterministe et sourcé, donc conforme à FR-037 et FR-038.
3. **Les trois scénarios déjà écrits** (`ClaimCheck`, `Pulse`, `Tandem`) — utiles comme point de départ pour FR-049 et pour le choix du second scénario (Q3).

`src/assets/usine.css` (1318 lignes) porte le design system et se conserve.

## Alternatives écartées

- **Écrire notre propre runtime de composition.** Écarté : Cordis est prouvé, et le réécrire consommerait tout le budget sans rien prouver de plus. Garde-fou explicite dans la vision.
- **Run entièrement piloté par LLM par défaut.** Écarté : coût par visiteur, latence, non-déterminisme du spectacle, et dépendance à une clé pour que la page ait un intérêt. Contraire à la contrainte de frugalité.
- **Rester sur le run scripté et l'assumer comme théâtre.** Écarté par `docs/0-DECISIONS.md` : la version théâtrale est explicitement jetée au profit d'un vrai moteur. La vision antérieure prévoyait un milieu simulé avec un payoff réel ; la décision du 2026-08-20 remonte l'exigence de réalité au moteur lui-même.
- **Thème sombre ou multi-thème.** Écarté : le design system Memo Labs est clair, un seul thème assumé.

## Profondeur produit non retenue dans le PRD

- **Monétisation.** Stripe plus metering, réutilisant PayKit. Hors v1, mais l'architecture ne doit pas rendre l'ajout coûteux.
- **Données et niche réelle.** PostgreSQL avec pgvector et recherche hybride, registre EU comme source de vérité pour les compléments, dans la perspective d'une version serveur d'une niche. Sans objet pour la v1 client-only, structurant pour la suite.
- **Infrastructure.** Docker (node22 vers nginx, pnpm), VPS Netcup sous `/opt/projects`, domaine dédié, entrée dans `lab-hub/public/projects.json`. Chaque application Memo Labs a son dépôt et son sous-domaine.
- **Positionnement.** Le flagship et la première démo de niche sont le même run — choix explicite. Les niches suivantes réutilisent le moteur en changeant la source de vérité et l'expert qui signe.
