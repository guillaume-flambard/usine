---
title: 'Identité de branche et mode fork du pilote'
type: feature
created: '2026-08-24'
status: 'done'
baseline_revision: 'c7c76e14fd01ea1ed9f5163c12bcbcfbf2d26772'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-fork-timeline-2026-08-24/ARCHITECTURE-SPINE.md'
warnings:
  - multiple-goals
deferred:
  - "Story 6 : le store de branche n'est nourri que par le flux de son kernel (AD-38) — la re-matérialisation à N puis la divergence. Il ne re-réduit pas le préfixe d'archive, donc il ne porte ni l'écran ni l'historique d'agents d'avant le fork. Le panneau de branche réensemencera l'écran à N."
---

<intent-contract>

## Intent

**Problem:** L'hydratation (story 2) donne un kernel vivant à N, mais rien ne
**crée une branche** ni ne la distingue du tronc dans le flux. Il manque (a) une
**identité de branche** — `branchId`, clé d'événement, événement `branch-forked`
(CAP-4, AD-43/44/45/46) — et (b) le **mode fork du pilote** qui expose tronc +
branche coexistants (CAP-3, AD-37/38/48). Les deux sont indissociables :
l'identité n'a de sens qu'une fois qu'un producteur (le fork) émet des
événements de branche. Livrées ensemble (d'où `multiple-goals`, gardé exprès).

**Approach:** (a) Ajouter `branchId?: string` optionnel sur `Base`
(`src/runtime/events.ts`) — **absent = tronc** ; un nouvel événement
`BranchForked`. Le **runtime** mint un `branchId` opaque (`mintBranchId()`), et
`createKernel({ branchId })` **estampille** chaque événement émis avec lui ; une
méthode kernel `noteFork({ trunkId, from, offset })` émet `branch-forked`. (b)
Ajouter `pilot.fork(archive, at)` : construit un **tronc** (store sans kernel,
préfixe `[1..N]` via `replayInto({ stopAt })`), une **branche** (kernel hydraté à
N via `hydrateKernel`, avec `branchId`, store connecté), émet `branch-forked`, et
expose les deux. Deux read models isolés.

## Boundaries & Constraints

**Always:**
- Réutiliser `createStore`, `replayInto({stopAt})` (story 1), `hydrateKernel`
  (story 2), `createKernel`, `liveBehaviours`. Seul `src/runtime/` importe cordis.
- `branchId` **opaque**, minté par le runtime, **indépendant de N** (AD-43) ; un
  événement de branche est estampillé `branchId`, un événement de tronc ne l'est
  pas (clé effective `(branchId, sequence)`, AD-44).
- `branch-forked` est le **premier** événement de la branche et porte
  `{ trunkId, from: N, offset }` où `offset` = le `at` de l'événement N sur le
  tronc (AD-46, axe temps aligné). `at` reste un élapsé (AD-33).
- Tronc = **store sans kernel** (AD-48) ; branche = kernel + store isolés (AD-38).
  Un remplacement sur la branche ne touche pas le read model du tronc.
- Code en anglais ; doc/commentaires en français ; tests d'abord.

**Block If:**
- L'ajout de `branchId?` sur `Base` casse le rejeu ou le réducteur existants
  (un événement sans `branchId` doit rester valide et se réduire comme avant) →
  HALT `blocked`, condition `base change breaks existing replay`.

**Never:**
- Ne pas ré-exécuter d'agents ni de traces étrangères (hors v1).
- Ne pas rendre `branchId` obligatoire (casserait tout le flux existant) ni le
  dériver de `sequence`/N.
- Ne pas modifier `performReplacement`. Ne pas introduire d'horloge absolue.
- Ne pas partager un read model vivant entre tronc et branche (AD-45 : chacun
  re-réduit / reçoit son flux).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fork à N | archive maison + at=N | `pilot.fork` rend un tronc (store, pas de kernel) et une branche (kernel + store) | — |
| branch-forked | après fork | 1er événement de branche : `type:'branch-forked'`, `branchId` set, `{trunkId, from:N, offset}` | — |
| Estampille | événements émis par la branche | portent `branchId` ; les événements du tronc ne le portent pas | — |
| Isolation | remplacement d'un comportement sur la branche | read model branche bouge (replacements+1) ; read model tronc inchangé | — |
| branchId opaque | deux forks du même N | deux `branchId` distincts, opaques, non dérivés de N | — |
| Rejeu inchangé | flux existant sans branchId | réduit exactement comme avant (aucune régression) | Block If sinon |

</intent-contract>

## Code Map

- `src/runtime/events.ts:15-28` -- `Base { sequence, at }` : ajouter `branchId?: string` ; ajouter `BranchForked` à l'union `RunEvent`.
- `src/runtime/kernel.ts:134-141` -- `emit` estampille `sequence`+`at` ; y ajouter `branchId` quand le kernel en a un. `createKernel` prend `{ branchId? }`. Ajouter `mintBranchId()` (opaque, ex. `crypto.randomUUID()`) et une méthode `noteFork({trunkId, from, offset})` émettant `branch-forked` (minting runtime-only).
- `src/app/fork.ts` -- `hydrateKernel` : accepter/propager un `branchId` au `createKernel` interne (ou l'exposer pour que le pilote le fournisse).
- `src/app/replay.ts` -- `replayInto({stopAt})` (story 1) pour nourrir le tronc.
- `src/state/store.ts` -- `createStore` (un par branche), `connect`/`receive`. Le réducteur ignore `branch-forked` (cas non spécial) sans casser `lastSequence`.
- `src/orchestration/pilot.ts:137-364` -- ajouter `fork(archive, at)` et l'exposition tronc/branche, à côté de `start`/`replay` (mêmes factories, aucun singleton).
- `src/state/reducer.ts` -- vérifier qu'un `branch-forked` inconnu tombe dans le no-op (bump `lastSequence`) sans lever.

## Tasks & Acceptance

**Execution:**
- `src/runtime/events.ts` -- `Base.branchId?`, `BranchForked` dans l'union.
- `src/runtime/kernel.ts` -- `mintBranchId()`, `createKernel({branchId?})` estampillant l'émission, `noteFork(...)` émettant `branch-forked`.
- `src/app/fork.ts` -- propager `branchId` au kernel hydraté.
- `src/orchestration/pilot.ts` -- `fork(archive, at)` : tronc (store + `replayInto` stopAt), branche (hydrateKernel + store connecté + `noteFork`), exposition des deux.
- Tests (node, via `spawnVmWorker`) : `src/runtime/__tests__/kernel.spec.ts` (estampille + `branch-forked`), `src/orchestration/__tests__/fork.spec.ts` (nouveau : fork rend tronc+branche, branch-forked correct, isolation d'un remplacement, deux branchId distincts, rejeu d'un flux sans branchId inchangé).

**Acceptance Criteria:**
- Given une archive maison, when `pilot.fork(archive, N)`, then un tronc (store sans kernel, réduit sur `[1..N]`) et une branche (kernel + store) coexistent, et le premier événement de branche est `branch-forked` portant `{trunkId, from:N, offset}`.
- Given une branche forkée, when on remplace un comportement sur la branche, then le read model de la branche compte le remplacement et le read model du tronc ne bouge pas.
- Given deux forks du même N, when on lit leurs `branchId`, then ils sont distincts et opaques.
- Given un flux existant sans `branchId`, when on le réduit, then le read model est identique à avant (aucune régression des suites existantes).

## Design Notes

`branchId` optionnel sur `Base` = compatibilité ascendante : tout le flux
existant (tronc, runs maison, archives v1) reste valide, `branchId` absent
signifiant « tronc ». La clé `(branchId, sequence)` est donc effective sans
changer la numérotation par-kernel : deux kernels recomptent `sequence` à partir
de 1, mais leurs événements se distinguent par `branchId`. Le tronc n'a pas de
kernel (AD-48) : il est nourri par `replayInto` dans son store, exactement comme
un rejeu borné. `offset` aligne les deux axes de temps pour l'affichage
ultérieur (story 6).

## Verification

**Commands:**
- `pnpm test` -- expected: suites node vertes, nouveaux tests compris, **aucune régression** des tests de flux/rejeu existants.
- `pnpm type-check` -- expected: vert.
- `pnpm lint` -- expected: vert (dont la règle d'isolation cordis).

## Review Triage Log

### 2026-08-24 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 1, medium 0, low 4)
- defer: 3: (low 3)
- reject: 3
- addressed_findings:
  - `[high]` `[patch]` Read model de branche incohérent : le store était nourri du préfixe re-réduit ET du kernel (nœuds dupliqués, ids en collision, lastSequence en arrière, narration figée). Corrigé : le store de branche n'est piloté que par le flux de son kernel (via `onKernelReady`, abonné avant les loads d'hydratation) ; le préfixe reste la vue du tronc (AD-38).
  - `[low]` `[patch]` Fuite du kernel de branche sur échec — `noteFork` déplacé dans `onKernelReady`, déjà couvert par le try/catch + releaseAll d'hydrateKernel.
  - `[low]` `[patch]` `at` non validé — throw `fork point out of range` sous la première borne ; `from = boundary.sequence` (cohérent avec `offset`).
  - `[low]` `[patch]` `BranchForked.branchId` rendu obligatoire (le seul événement qui doit toujours en porter un).
  - `[low]` `[patch]` `stream()` renvoie une copie, plus le tableau interne mutable.

## Auto Run Result

Status: done

**Changement livré.** Identité de branche + mode fork. `branchId?` optionnel sur `Base` (absent = tronc), événement `BranchForked {trunkId, from, offset}`, `mintBranchId()` (opaque, runtime), `createKernel({branchId})` estampille chaque émission, `kernel.noteFork(...)`. `pilot.fork(archive, at)` construit un tronc (store sans kernel, préfixe via `replayInto stopAt`) et une branche (kernel hydraté à N + store piloté par le flux du kernel), émet `branch-forked` en premier, deux read models isolés (AD-37/38/43/44/45/46/48).

**Fichiers.** `src/runtime/events.ts` (`Base.branchId?`, `BranchForked`), `src/runtime/kernel.ts` (`mintBranchId`, `createKernel({branchId})`, `noteFork`, estampille), `src/app/fork.ts` (`HydrateOptions.branchId`/`onKernelReady`), `src/orchestration/pilot.ts` (`fork`, types `Trunk`/`Branch`/`Fork`), tests `kernel.spec.ts` + `orchestration/__tests__/fork.spec.ts` (nouveau).

**Revue (4 couches).** 1 défaut de correction haute gravité corrigé (cohérence du read model de branche) + 4 patchs bas. 3 reports différés (écran/historique de branche à N → story 6 ; consommateur d'`offset` → story 6 ; type nommé pour la charge `noteFork`). 3 rejets (fallback `crypto`, test de forme d'UUID, renommage `fork.ts`). Aucun intent_gap, aucun bad_spec. Déviation acceptée : `branch-forked` émis **en premier** (exigence AD-44), sans effet sur la cohérence (no-op au réducteur).

**Follow-up review recommandé : true** — un patch de gravité haute dans la passe.

**Vérification.** `pnpm test` 299/299, `pnpm type-check` vert, `pnpm lint` vert (dont la règle d'isolation cordis).

**Risque résiduel.** Le panneau de branche (story 6) devra réensemencer l'écran à N : le store de branche ne porte pas l'écran/historique d'avant le fork (voir `deferred`).
