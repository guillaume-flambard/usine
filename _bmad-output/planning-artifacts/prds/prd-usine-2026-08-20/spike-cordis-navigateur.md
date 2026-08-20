# Spike Q1 — Cordis dans le navigateur

**Date :** 2026-08-20 · **Verdict : 13/13, Q1 est close.**

## Question posée

`docs/0-DECISIONS.md` posait la première tâche d'ingénierie : « Cordis tourne-t-il dans le bundle navigateur (Vite) ? Si non, isoler le moteur (worker / petit backend). » Le PRD en avait fait Q1 et R1, avec un repli sur Web Worker en `[ASSUMPTION]`.

## Protocole

`cordis@4.0.0-rc.8` installé dans le projet. Un module TypeScript strict (`spike/cordis-browser/experiment.ts`) exécute treize vérifications sur un `Context` réel, sans aucune couche d'émulation. Le module est bundlé par Vite 8 puis servi en HTTP et exécuté dans **Google Chrome headless**, pas dans Node. Les résultats sont lus dans le DOM produit.

Rejouer : `npx vite build --config spike/cordis-browser/vite.config.ts`, servir `spike/cordis-browser/dist/`, ouvrir la page.

## Résultats

| # | Vérification | Résultat |
|---|---|---|
| 1a | Un composant se charge et installe ses effets | OK — `ouvre:1 → ouvre:2` |
| 1b | `dispose()` annule les effets **en ordre inverse** | OK — `ferme:2 → ferme:1` |
| 2a | Le maître spawn un composant enfant | OK |
| 2b | Décharger le maître **cascade** sur son enfant | OK |
| 3a | L'agent reste inactif tant que sa dépendance manque | OK — `state=PENDING` |
| 3b | L'agent **s'active tout seul** quand la dépendance arrive | OK |
| 3c | L'agent **se désactive tout seul** quand la dépendance part | OK |
| 3d | L'agent **se réactive** quand la dépendance revient | OK |
| 4a | Composant fabriqué à l'exécution via `new Function` | OK (hors CSP stricte, voir ci-dessous) |
| 4b | Le composant fabriqué se retire proprement | OK |
| 4c | Composant fabriqué **par composition, sans `eval`** | OK |
| 4d | Le composant composé se retire proprement | OK — teardown en ordre inverse |
| 5a | Le runtime expose sa topologie | OK — `registry.size`, `registry.counter` |

## Ce que ça règle

**Q1 est close : Cordis tourne dans le navigateur.** Aucun repli n'est nécessaire — ni Web Worker, ni backend. Le moteur reste client-only, donc NFR-005 et NFR-006 (aucun coût variable par visiteur) tiennent.

Trois faits mesurés :

- **Aucun builtin Node dans le bundle.** `cordis/lib/index.js` n'importe que `cosmokit`. Zéro occurrence de `node:`, `require(`, `process.` ou `__dirname` dans le bundle produit.
- **Poids négligeable.** 32,3 ko bruts, **11,4 ko gzip**, moteur et expérience compris. Sans effet sur NFR-007.
- **Le coeffect réactif fonctionne.** C'était le point noté « reste à câbler » dans `docs/2-EXECUTION.md`. Les métadonnées `provide` / `inject` du plugin suffisent : l'agent attend en `PENDING`, s'active seul, se désactive seul, se réactive. FR-008, FR-009 et FR-010 sont réalisables tels qu'écrits.

## Ce que ça découvre — la contrainte CSP

Rejoué avec `Content-Security-Policy: default-src 'self'`, le résultat tombe à **11/13** :

> `EvalError: Evaluating a string as JavaScript violates the following Content Security Policy directive because 'unsafe-eval' is not an allowed source of script`

La génération de composant **par évaluation de code** (4a, 4b) est donc conditionnée à une CSP permissive. La génération **par composition de primitives** (4c, 4d) passe sous CSP stricte et produit le même fait : un composant qui n'existait pas avant le run, fabriqué à partir d'une spécification, chargé à chaud, retiré proprement.

Conséquence pour FR-052 et Q9 : la voie par composition est la voie par défaut. Elle ne demande aucune concession de sécurité et tient la promesse. La voie par évaluation reste disponible pour le mode LLM branché, où une spécification réellement imprévue justifie d'assouplir la CSP — c'est un arbitrage à poser explicitement, pas à subir.

## Ce que ça ne règle pas

- Le comportement sous charge (NFR-002 : 40 nœuds vivants à 50 images par seconde) n'est pas mesuré. L'expérience porte sur une poignée de composants.
- Le HMR (`@cordisjs/plugin-hmr`) n'est pas testé : la réactivation vérifiée en 3d est un rechargement de composant, pas un remplacement de module à chaud.
- Le comportement en cas d'échec d'activation (FR-014) n'est pas couvert.
