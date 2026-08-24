---
title: 'Le panneau à deux futurs (story 6b)'
type: feature
created: '2026-08-24'
status: 'done'
baseline_revision: 'f9459ff04990dc2bba1361d55f3a7abf3ffa131e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-fork-timeline-2026-08-24/ARCHITECTURE-SPINE.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-usine-2026-08-20/DESIGN.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Tout le moteur du fork existe (stories 1–5, 6a, 7) mais rien ne le
**montre**. Il faut le payoff visible : forker un run, voir **deux futurs
diverger côte à côte** sous porte humaine (CAP-3/6, AD-38/39).

**Approach:** Un composant `src/ui/ForkView.vue` qui rend **deux sous-panneaux
dans la zone scène** (pas de cinquième zone, AD/DESIGN) : **Tronc** (à gauche,
un *recording*) et **Branche** (à droite, une *exécution neuve*). Chaque panneau
montre l'application à N (écran + comportements). `FactoryApp` gagne un contrôle
« Forker ce run » (quand un produit sert), tient le `Fork` courant, et affiche
`ForkView`. La branche diverge par **édition d'un comportement** (v1 sans agents)
→ `branch.replace(name, code)` ; le tronc ne bouge jamais. Un bandeau **compare**
les deux (`measureRun`, story 7). Une **porte par branche** : valider (garder) ou
rejeter (teardown de la branche).

## Boundaries & Constraints

**Always:**
- Réutiliser `pilot.fork` (6a : `trunk.behaviours`/`trunk.screen`,
  `branch.behaviours`/`branch.screen`/`replace`/`stream`), `LiveApplication` (ou
  son pont `frame-host`) pour rendre chaque application, `measureRun`/`measureDelta`
  (story 7) pour le bandeau, `LiveGraph` replié par panneau si utile.
- **Honnêteté (AD-41) visible** : le panneau tronc est étiqueté « Tronc —
  enregistrement » (lecture seule), la branche « Branche — exécution neuve ». Un
  mot dit que le retour arrière est *intra-runtime* (on prévient, on ne répare
  pas un effet externe). Aucun élément non payé par un fait réel (DESIGN).
- **Quatre zones** : la vue fork vit dans la zone scène ; on n'ajoute pas de zone.
- Rejeter une branche = teardown entier (`branch.kernel.releaseAll()`, AD-47) ;
  le tronc et le run restent intacts.
- Code en anglais ; libellés/commentaires en français. Tests d'abord.

**Block If:**
- `pilot.fork` ne fournit pas ce qu'il faut pour rendre les deux applications
  (écran/comportements d'un côté manquants) → HALT `blocked`, condition
  `fork data insufficient for two panels`.

**Never:**
- Ne pas muter le tronc (aucun `replace`/édition côté tronc — c'est un recording).
- Ne pas réintroduire d'agents/traces étrangères (hors v1).
- Ne pas afficher de métrique sans mesure réelle (bandeau vide si pas de données).
- Ne pas casser le run normal : hors fork, la scène est inchangée.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Entrer en fork | un produit sert, clic « Forker ce run » | la scène montre deux panneaux (tronc | branche) à N | — |
| Diverger | éditer un comportement de la branche + valider | l'app de la branche répond avec le nouveau code ; le tronc inchangé | code non compilable → message, v précédente sert |
| Comparer | après divergence | le bandeau montre les mesures tronc vs branche et l'écart (`measureRun`) | — |
| Rejeter la branche | clic « Rejeter la branche » | la branche est défaite (teardown) ; retour au run, tronc intact | — |
| Sortir | clic « Revenir au run » | la vue fork se ferme, la scène normale revient | — |

</intent-contract>

## Code Map

- `src/orchestration/pilot.ts` -- `fork(archive, at)` → `Fork { trunk, branch }` ; `Trunk.behaviours/screen`, `Branch.behaviours/screen/replace/stream/kernel/store`.
- `src/ui/FactoryApp.vue:536-575` -- la zone `.live`/`.zone` : y brancher le contrôle « Forker ce run » et le rendu `<ForkView>` ; `state.lastSequence` = le N du fork ; `pilot.archive()` = l'archive à forker.
- `src/ui/LiveApplication.vue` -- le rendu d'une application (écran sablé + comportements + session) ; à réutiliser par panneau, ou s'inspirer de son usage de `frame-host`.
- `src/app/measure.ts` -- `measureRun(archive)` + `measureDelta(a,b)` pour le bandeau (tronc = préfixe `sequence<=N`, branche = `branch.stream()`).
- `src/ui/LiveGraph.vue` -- graphe pur, réutilisable par panneau (replié).
- `src/app/session.ts` -- `createSession()` : une session par panneau pour compter les interactions conservées.
- `_bmad-output/planning-artifacts/ux-designs/ux-usine-2026-08-20/DESIGN.md` -- jetons, règle d'honnêteté, discipline des zones.

## Tasks & Acceptance

**Execution:**
- `src/ui/ForkView.vue` (nouveau) -- deux sous-panneaux (grid), chacun rend l'application (écran + comportements), étiquettes d'honnêteté ; côté branche, une édition de comportement → `emit('replace', {name, code})` ; bandeau de comparaison via `measureRun` ; boutons `emit('reject')` / `emit('exit')`.
- `src/ui/FactoryApp.vue` -- bouton « Forker ce run » (quand un produit sert), `fork = ref<Fork | undefined>()`, `onFork()` = `pilot.fork(pilot.archive()!, state.lastSequence)`, rendu `<ForkView>` dans la scène quand `fork` est défini, handlers `@replace`→`fork.branch.replace`, `@reject`→`releaseAll` + `fork=undefined`, `@exit`→`fork=undefined`.
- Tests navigateur (`src/ui/fork-view.browser.spec.ts` ou dans le shell) -- entrer en fork montre deux panneaux ; éditer un comportement de branche fait diverger la branche sans toucher le tronc ; le bandeau montre un écart ; rejeter défait la branche.

**Acceptance Criteria:**
- Given un run qui sert un produit, when le visiteur clique « Forker ce run », then la scène montre deux panneaux, tronc (enregistrement) et branche (exécution), chacun avec son application à N.
- Given la vue fork, when le visiteur édite un comportement de la branche et valide, then l'application de la branche répond avec le nouveau code et celle du tronc reste identique.
- Given une divergence, when on lit le bandeau, then il montre les mesures des deux côtés et leur écart, sans métrique inventée.
- Given la vue fork, when le visiteur rejette la branche, then la branche est défaite et le run/tronc restent intacts.

## Design Notes

L'app du tronc est un *recording* : on la rend en lecture (ses comportements
recompilés à N répondent, mais aucune édition). La branche est vivante : éditer
un comportement appelle `branch.replace`, la nouvelle version répond, le bandeau
se recalcule. La divergence par édition de code est le déclencheur **v1** (sans
agents) ; c'est dev-facing mais réel — il démontre la thèse : forker, changer à
chaud, mesurer l'écart, sans toucher au tronc. La mise en page suit DESIGN
(app-protagoniste, graphe replié), et tient dans la zone scène.

## Verification

**Commands:**
- `pnpm test` -- expected: suites node vertes (aucune régression).
- `pnpm test:browser` -- expected: la nouvelle suite fork-view passe.
- `pnpm type-check` / `pnpm lint` -- expected: verts.

**Manual checks:**
- `pnpm dev`, faire un run jusqu'à un produit, cliquer « Forker ce run », éditer
  un comportement de la branche : la branche diverge, le tronc ne bouge pas, le
  bandeau montre l'écart.

## Auto Run Result

Status: done

**Changement livré.** `src/ui/ForkView.vue` (nouveau) : deux sous-panneaux dans la zone scène — Tronc (recording, lecture seule) | Branche (exécution neuve), étiquettes d'honnêteté, ligne « retour arrière intra-runtime », édition d'un comportement de branche → `emit('replace')`, bandeau de comparaison mesuré (`measureRun`/`measureDelta`), porte par branche (garder/rejeter). `FactoryApp.vue` : bouton « Forker ce run » (via `LiveApplication` `forkable`/`fork`), `onFork`/`onBranchReplace`/`onBranchReject`/`onForkExit`, rendu `<ForkView>` dans la scène.

**Correctif clé (repris après coupure de session).** `fork.value = markRaw(await pilot.fork(...))` : sans `markRaw`, la réactivité Vue « déballait » les refs internes des stores du Fork, et `branch.store.state.value` devenait `undefined` (les 4 tests navigateur tombaient à `ForkView:63`). Le Fork porte des objets vivants (kernels, stores) qui ne doivent pas être rendus réactifs.

**Vérification.** Node 308/308, `type-check` + `lint` verts, navigateur **62/62** (dont 4 nouveaux `fork-view.browser.spec`). Vérifié aussi **en vrai navigateur** (capture) : fork depuis un run servi → deux panneaux ; édition d'un comportement de branche → branche v2, Remplacements branche 0→1 (+1), tronc inchangé, bandeau qui mesure l'écart.

**Différé.** Le déclencheur de divergence v1 est l'édition de code (dev-facing) — la re-exécution d'agents étrangers reste hors périmètre (spine `Deferred`).
