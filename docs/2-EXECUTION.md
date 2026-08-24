# Memo Labs — L'usine agentique · Exécution (étapes, stack, user flow)

> **Mis à jour le 2026-08-20.** Ce document a été corrigé après le PRD et le spike Cordis. La version précédente prescrivait Next.js / React / Tailwind et un back Node/FastAPI : **c'était périmé**, `0-DECISIONS.md` prime et impose Vue 3 + Vite en client-only. Source de vérité désormais : `_bmad-output/planning-artifacts/prds/prd-usine-2026-08-20/prd.md`.

## Architecture en deux couches

1. **Le noyau de composition** = Cordis (`@cordisjs`). Il gère *comment* les agents et outils se composent, se câblent, se révoquent, se remplacent à chaud. Prouvé, en TypeScript. On ne le réécrit pas.
2. **La couche agentique** (ce qu'on écrit) = les agents qui planifient, génèrent des composants (agents/outils) et les chargent via le noyau. Le graph engineering (planner → parallèles → skeptic → merge → human gate) vit ici ; chaque nœud du graphe est un composant Cordis.

**Séparation nette :** Cordis est la plomberie de composition ; notre couche est ce que les agents décident. Cordis n'apporte pas l'IA, il apporte le runtime.

## La stack (corrigée)

- **Front et application** : **Vue 3 + TypeScript strict + Vite**, pnpm, ESLint/oxlint + Prettier. Scaffoldé via `create-vue`. Design system Memo Labs (voir doc 3).
- **Couche composition** : `cordis@4.0.0-rc.8`, installé et vérifié dans le projet. `@cordisjs/loader` et `@cordisjs/plugin-hmr` sont **envisagés mais ni installés ni testés**.
- **Exécution** : **client-only**. Pas de backend, pas de worker, pas de base de données. Le moteur tourne dans l'onglet.
- **IA** : aucune par défaut. Un interrupteur branche un LLM sur un agent à la demande, avec clé fournie par l'utilisateur et gardée en mémoire de session.
- **Déploiement** : build statique, Dockerfile node22 → nginx, VPS, `usine.memolabs.dev`, entrée dans `lab-hub/public/projects.json`.
- **Plus tard, hors v1** : PostgreSQL + pgvector et registre EU comme source de vérité pour une version serveur d'une niche ; Stripe + metering pour la monétisation.

## Le modèle de composant (le contrat)

Chaque **agent** et chaque **outil** est un composant Cordis :

- **`inject`** (coeffects requis) : ce dont il a besoin. Il ne s'active que quand tout est fourni.
- **`provide`** (coeffects fournis) : ce qu'il expose.
- **`apply`** (effet) : ce qu'il installe au chargement **+ son inverse**, joué automatiquement au déchargement.

Conséquences directes :

- L'agent maître **spawn** un composant via `ctx.plugin(component)` → un `Fiber`. Décharger le maître **cascade** sur tout ce qu'il a créé.
- Les **dépendances** entre agents/outils forment la topologie de coeffects. C'est ce qu'on visualise.
- **Fabrication à l'exécution** : un agent compile une spécification en composant et le charge ; tout est réversible.

## Ce qui est prouvé (spike du 2026-08-20, 13/13 dans Chrome)

Rapport complet : `_bmad-output/planning-artifacts/prds/prd-usine-2026-08-20/spike-cordis-navigateur.md`. Code : `spike/cordis-browser/`.

- **Cordis tourne dans le navigateur.** Bundle Vite, aucune API native de Node, 11,4 ko gzip. Aucun repli nécessaire.
- **Effets réversibles** : `dispose()` annule les effets en ordre inverse.
- **Cascade** : décharger le maître libère l'enfant.
- **Coeffect réactif** — le point qui était noté « reste à câbler » : l'agent attend en `PENDING`, s'active seul quand sa dépendance arrive, se désactive seul quand elle part, se réactive quand elle revient. Les métadonnées `provide` / `inject` suffisent.
- **Fabrication à l'exécution**, dans deux voies : par composition de primitives (sans `eval`) et par évaluation de code (`new Function`).
- **Introspection** : `registry.size` et `registry.counter` exposent la topologie.

**Contrainte découverte** : sous `Content-Security-Policy: default-src 'self'`, `new Function` échoue. La voie **par composition** est donc la voie par défaut ; la voie par évaluation est réservée au mode LLM branché, comme arbitrage explicite.

**Ce qui n'est pas prouvé** : la tenue à 40 nœuds vivants.

**Prouvé depuis (2026-08-24)** : la boucle réactive minimale — une interaction
du visiteur devient un événement `visitor-interacted` dans le flux, réveille
l'agent qui a écrit le comportement, et déclenche un remplacement à chaud **en
réponse** ; l'échec d'activation laisse la version précédente servir ; un rejeu
reproduit la recomposition depuis le seul flux. Reste hors périmètre : la tenue
du HMR à l'échelle.

## Les deux modes d'exécution

- **Mode par défaut — composition réelle, jugement déterministe.** Client-only, sans clé, sans token. Les agents sont de vrais composants qui exécutent vraiment, fabriquent vraiment, et streament leurs messages. Ce qui est déterministe, c'est leur jugement, pas leur existence.
- **Mode LLM branché.** Un interrupteur, une clé, des agents qui raisonnent réellement. Pour les entretiens techniques, les niches et les démonstrations privées.

Ce qui a été **jeté** : le run choréographié par timers de `src/usine/run.ts`. Conservés et reportés : le design system, la géométrie du graphe, le moteur de règles du vérificateur d'allégations et les trois scénarios déjà écrits (ClaimCheck, Pulse, Tandem).

## Le user flow

1. **Le brief** : un champ pré-rempli, modifiable.
2. **Lancer l'usine** : un bouton. Premier signe de vie en moins de 1,5 s.
3. **L'application apparaît, et on s'en sert** : en quelques secondes un écran et un premier comportement sont posés. Le visiteur s'en sert **pendant** que le run continue — il ne regarde pas un chantier, il utilise un outil.
4. **Elle mue autour de l'usage** : à mesure que le visiteur tape, les agents refont les comportements à chaud, en réponse à ce qu'il en fait, sans qu'il perde sa session. Le graphe reste consultable comme preuve (nœuds, états réels, artefacts), mais replié : l'application est le protagoniste.

> **Révisé le 2026-08-24.** L'ancien user flow plaçait « le payoff » — un
> vérificateur figé — à la fin. Le produit est brief-agnostique et vivant : la
> valeur est la mue en usage, pas un livrable terminal. La conformité des
> allégations reste un brief exemplaire, pas l'aboutissement obligé.

## Les étapes de build

### Phase 0 — Fondations · ✅ porte franchie le 2026-08-20

Faisabilité navigateur vérifiée, coeffect réactif prouvé, cascade et réversion prouvées, fabrication à l'exécution prouvée dans ses deux voies. **Reste** : figer le contrat de composant à partir de ce qui a été mesuré.

### Phase 1 — Le run réel et le graphe

Moteur de run, flux d'événements typés, graphe projeté depuis la topologie réelle, narration, artefacts consultables, porte humaine.
**Porte** : un run complet réel, de bout en bout, sans LLM.

### Phase 2 — L'application vivante et réactive

L'application sert pendant le run ; les agents la refont à chaud, et — depuis le
2026-08-24 — **en réponse à ce que le visiteur en fait**, sans qu'il perde sa
session. La conformité des allégations reste un cas d'usage exemplaire, réel,
déterministe et sourcé, mais brief-agnostique.
**Porte** : un visiteur se sert de l'application, la voit muer autour de ce qu'il
tape, et ne perd rien à aucun remplacement.

### Phase 3 — LLM branchable

Interrupteur, agents raisonnants, garde-fous, repli déterministe en cas d'échec.
**Porte** : sur un brief simple, un agent réel produit un plan exploitable.

### Phase 4 — Déploiement et seconde niche

Mise en ligne sur `usine.memolabs.dev`, entrée dans le hub, second scénario.
**Porte** : montrable publiquement et en entretien.
