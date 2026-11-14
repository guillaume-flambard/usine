# Memo Labs — L'usine agentique · Exécution (étapes, stack, user flow)

> **Historique v1.** Ce document décrit l'usine avant la refonte v2. Il est
> gardé pour la trace des décisions, mais ne fait plus autorité là où il parle
> de Cordis, du Web Worker, du relais Node ou du refus des frameworks. La cible
> est fixée par `docs/adr/0001-adopter-les-frameworks-agentiques-du-marche.md`
> (14 novembre 2026), et le backlog est dans Linear (projet « Usine v2 »).

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

> **Cible atelier — révisé le 2026-08-24 (`7-MIGRATION.md`).** L'entrée n'est
> plus un brief « construis un outil » : c'est **l'import/rejeu d'une trajectoire
> d'agent qui a planté**. Le run ne fabrique plus une app — il **forke** et
> prévisualise deux futurs. Même moteur, autre récit.

1. **Importer/rejouer une trace** : on charge une trajectoire d'agent qui a
   échoué (rejeu déterministe de l'**état**, pas des logs).
2. **Rejouer jusqu'à l'événement N** : on s'arrête à l'instant du problème — le
   `sequence` du flux rend ce point adressable.
3. **Forker la timeline** : à partir de N, une branche vivante diverge du tronc.
4. **Hot-swap l'agent sur la branche** : on remplace l'agent/comportement à
   chaud (`kernel.replace`, réversible), sans toucher au tronc.
5. **Deux futurs côte à côte** : le graphe live montre la divergence ; un bandeau
   compare les branches (métriques diffées, cf. `services/api/.../evaluation.py`).
6. **La porte : valide ou rejette la branche** — avant de pousser en prod.

> **Honnêteté à tenir en démo** : le rollback est *intra-runtime* (il restaure la
> composition, pas un effet externe déjà parti). On vend « **prévenir avant** »
> (porte + branche sandbox), pas « réparer après ». Et on n'est pas une
> plateforme de fiabilité : une **primitive** (réversibilité + fork visuel).

## Les étapes de build

### Phase 0 — Fondations · ✅ porte franchie le 2026-08-20

Faisabilité navigateur vérifiée, coeffect réactif prouvé, cascade et réversion prouvées, fabrication à l'exécution prouvée dans ses deux voies. **Reste** : figer le contrat de composant à partir de ce qui a été mesuré.

### Phase 1 — Le run réel et le graphe

Moteur de run, flux d'événements typés, graphe projeté depuis la topologie réelle, narration, artefacts consultables, porte humaine.
**Porte** : un run complet réel, de bout en bout, sans LLM.

### Phase 2 — L'atelier qui forke la timeline (cible, `7-MIGRATION.md`)

Les primitives sont là et testées : rejeu déterministe depuis le flux (AD-33),
hot-swap réversible avec rollback (`kernel.performReplacement`), porte humaine,
graphe live, harnais d'éval (`evaluation.py`). L'étape précédente — l'application
vivante et réactive — a **construit ces primitives** ; elle passe au second plan
comme cas d'usage, pas comme produit.

**Le fork gap (travail neuf, load-bearing)** : hydrater un **kernel vivant depuis
un préfixe de flux** (aujourd'hui `behavioursFromArchive` reconstruit des
comportements *sans* kernel, donc `kernel.replace` n'aurait rien à remplacer sur
une branche). Le reste est du câblage additif : `stopAt` sur `replayInto`, un mode
fork du pilot (rejoué-puis-vivant), un second store, une scène à deux panneaux,
une porte par branche.
**Porte** : sur une trace rejouée, on forke à N, on remplace un agent à chaud sur
la branche, et les deux futurs divergent visiblement, chacun sous sa porte.

### Phase 3 — LLM branchable

Interrupteur, agents raisonnants, garde-fous, repli déterministe en cas d'échec.
**Porte** : sur un brief simple, un agent réel produit un plan exploitable.

### Phase 4 — Déploiement et seconde niche

Mise en ligne sur `usine.memolabs.dev`, entrée dans le hub, second scénario.
**Porte** : montrable publiquement et en entretien.
