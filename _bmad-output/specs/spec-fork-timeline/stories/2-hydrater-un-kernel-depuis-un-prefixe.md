---
title: 'Hydrater un kernel vivant depuis un préfixe de flux'
type: feature
created: '2026-08-24'
status: 'done'
baseline_revision: 'c6b5e9c54a684e48d150161bd20acd77a61dfacb'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-fork-timeline-2026-08-24/ARCHITECTURE-SPINE.md'
warnings: []
deferred:
  - summary: >-
      Après un remplacement qui roule en arrière, le composant précédent est
      restauré (nom re-fourni) mais son isolat a été disposé au release : un
      comportement feuille restauré ne peut plus répondre en direct.
    evidence: |-
      Propriété pré-existante du couple comportement/isolat (componentFor dispose
      l'isolat sur teardown) ; non causée par l'hydratation, et hors périmètre
      (la spec interdit de toucher performReplacement). Le cas courant
      (remplacement refusé car le code ne compile pas) garde la version
      précédente pleinement en service ; seul l'échec à l'activation expose la
      limite. À reprendre si un rollback doit re-servir du code vivant.
    severity: low
---

<intent-contract>

## Intent

**Problem:** Le fork a besoin d'un **kernel vivant** reflétant l'état à un point N
d'un run conservé, pour qu'un remplacement à chaud y opère (AD-49, CAP-1).
Aujourd'hui `behavioursFromArchive` reconstruit des comportements **sans kernel**
(des isolats sans `Context`, sans `load`/`replace`) : `kernel.replace` n'aurait
rien à remplacer sur une branche. C'est le seul substrat neuf load-bearing du
fork.

**Approach:** Ajouter `hydrateKernel(archive, options?)` dans un nouveau module
`src/app/fork.ts`. Il détermine les comportements **vivants à N** (dernière
version non relâchée, source dans `build.source`) en parcourant le préfixe
`sequence <= stopAt`, crée un **kernel neuf** (`createKernel`), et **charge**
chaque comportement comme composant racine via `behaviourComponent` +
`kernel.load`. Il rend `{ kernel, behaviours }`. Chemin v1 : **comportements
maison uniquement** (leur code est dans le flux) ; pas d'agents (leurs closures
ne sont pas dans le flux) ni de traces étrangères.

## Boundaries & Constraints

**Always:**
- Réutiliser `createKernel` (`src/runtime/kernel.ts`), `behaviourComponent` /
  `behaviourKey` / `liveBehaviours` (`src/app/behaviour.ts`,
  `src/orchestration/factory.ts`), et le bornage par `sequence` de story 1
  (`ReplayOptions.stopAt`). Seul `src/runtime/` importe cordis — `fork.ts` ne
  l'importe pas.
- Un comportement est **vivant à N** s'il a été construit (`component-built` /
  `component-created` avec un `provides` `behaviour:*`) et **pas relâché** à N ;
  sa **version** est comptée par les `component-replaced` du préfixe (comme
  `behavioursFromArchive`, jamais lue dans un champ) ; sa **source** est le
  dernier `build.source` du composant qui la porte.
- `stopAt` absent = hydrater à la fin du flux (tout le run).
- L'ensemble hydraté doit **égaler** le modèle de lecture réduit sur `[1..N]`
  côté noms de comportements vivants (AD-45 : re-réduire le préfixe).
- Code en anglais (identifiants, fichiers, descriptions de tests) ; commentaires
  et doc en français. Tests d'abord.

**Block If:**
- Un comportement vivant à N n'a **aucune** source dans le flux (impossible à
  recompiler) → HALT `blocked`, condition `behaviour source missing in stream`.

**Never:**
- Ne pas ré-instancier d'agents ni exécuter de raisonnement (hors périmètre v1).
- Ne pas ouvrir de réseau : `fetchSource` reste optionnel et injecté ; sans lui,
  les comportements tournent purs (comme un run hors ligne).
- Ne pas muter l'archive ni le préfixe.
- Ne pas modifier `kernel.performReplacement` (le rollback existe déjà, AD-31) ;
  l'hydratation le rend seulement **atteignable**.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Hydratation à N | archive + stopAt=N | `liveBehaviours(kernel)` == noms/vues vivants du read model réduit sur `[1..N]` | — |
| Remplacement sur hydraté | kernel hydraté | `kernel.replace(id, v+1)` émet `component-replaced` ; la nouvelle version répond | — |
| Échec de remplacement | code de remplacement qui ne compile pas / tombe | pas de `component-replaced` ; la version précédente sert encore (AD-31) | rollback (existant) |
| Comportement relâché avant N | `component-released` dans le préfixe | absent du kernel hydraté | — |
| stopAt avant tout build | stopAt < 1er build | kernel vide, `behaviours: []` | — |
| Source manquante | comportement vivant sans `build.source` | rejet | Block If |

</intent-contract>

## Code Map

- `src/app/replay.ts:78-141` -- `behavioursFromArchive` : le **patron** du parcours de flux (traces, versions comptées, live-à-la-fin). L'hydratation borne ce parcours à `stopAt` et charge au lieu de compiler des isolats nus.
- `src/app/replay.ts` (`ReplayOptions.stopAt`, story 1) -- le bornage par `sequence`.
- `src/app/behaviour.ts:69` -- `behaviourComponent(spec, spawn, fetcher)` → `{component}` ; `behaviourKey`/`behaviourName` ; `BehaviourSpec { name, version, code, author, source? }`.
- `src/runtime/kernel.ts` -- `createKernel`, `load`, `replace`, `performReplacement` (rollback avec enfants, AD-31), `subscribe`.
- `src/orchestration/factory.ts:127` -- `liveBehaviours(kernel)` : lit les comportements vivants d'un kernel (réutiliser tel quel).
- `src/state/reducer.ts` -- le réducteur pur, pour comparer l'hydratation au read model réduit sur `[1..N]`.
- `src/agents/__tests__/vm-worker.ts` -- `spawnVmWorker` : l'isolat de test (node, pas de vrai Worker).

## Tasks & Acceptance

**Execution:**
- `src/app/fork.ts` -- créer `hydrateKernel(archive, options?: { stopAt?: number; spawnWorker?: SpawnWorker; fetchSource?: SourceFetcher }): Promise<{ kernel: Kernel; behaviours: readonly Behaviour[] }>`. Parcourir le préfixe (`sequence <= stopAt`) pour les comportements vivants à N (nom, version comptée, dernière source) ; `createKernel` ; pour chacun, `behaviourComponent(spec, spawnWorker, fetchSource)` puis `kernel.load(component)` ; rendre `{ kernel, behaviours: liveBehaviours(kernel) }`. Block If sur source manquante.
- `src/app/__tests__/fork.spec.ts` -- test node (via `spawnVmWorker`) couvrant chaque ligne de la matrice I/O : hydratation à N == read model réduit ; `kernel.replace` émet `component-replaced` et la nouvelle version répond ; échec de remplacement laisse la précédente servir ; comportement relâché absent ; stopAt avant tout build → vide ; source manquante → rejet.

**Acceptance Criteria:**
- Given un run conservé avec des comportements construits puis remplacés, when on `hydrateKernel(archive, { stopAt: N })`, then les noms/versions de `liveBehaviours(kernel)` égalent ceux du modèle de lecture obtenu en réduisant les événements `sequence <= N`.
- Given un kernel hydraté, when on `kernel.replace` un comportement vivant par une version qui compile, then un `component-replaced` est émis et la nouvelle version répond, sans redémarrage.
- Given un kernel hydraté, when un remplacement échoue (code qui ne compile pas ou tombe), then aucun `component-replaced` n'est émis et la version précédente continue de répondre (AD-31).

## Design Notes

L'hydratation est un **re-chargement**, pas une nouvelle abstraction : elle
réutilise exactement la brique qui a créé les comportements pendant le run
(`behaviourComponent` + `kernel.load`). Les comportements maison sont des
composants **feuilles** (sans enfant) : chargés à la racine, `kernel.replace`
opère avec `parent = root`, et la garantie « restaurer avec ses enfants » (AD-31)
tient trivialement — mais le chemin de rollback est bien exercé. `author` n'est
pas fiable dans le flux (il vit dans `build.specification`) : le prendre s'il
s'y lit, sinon un libellé neutre — il n'est qu'affiché, non load-bearing.

## Verification

**Commands:**
- `pnpm test` -- expected: la suite node passe, `fork.spec.ts` compris.
- `pnpm type-check` -- expected: vert.
- `pnpm lint` -- expected: vert.

## Review Triage Log

### 2026-08-24 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 0, medium 2, low 6)
- defer: 1: (high 0, medium 0, low 1)
- reject: 3
- addressed_findings:
  - `[medium]` `[patch]` Source présente mais non recompilable était silencieusement omise (cassait l'invariant == read model) — lève `behaviour failed to rehydrate` (symétrique du Block-If).
  - `[medium]` `[patch]` Kernel/isolats à moitié construits fuyaient sur échec en cours de boucle — try/catch + releaseAll avant de relancer.
  - `[low]` `[patch]` liveBehaviourSources (désormais exporté) supposait un flux trié — tri défensif par sequence avant réduction.
  - `[low]` `[patch]` Garde orphelin ratait une source vide '' — source falsy traitée comme manquante.
  - `[low]` `[patch]` Guillemets français dans un message d'erreur anglais — guillemets droits.
  - `[low]` `[patch]` Comptage de version testé seulement v1->v2 — ajout d'un flux v1->v2->v3 (version === 3).
  - `[low]` `[patch]` Test orphelin ne prouvait pas « rejet avant création » — cas mêlant valide + orphelin, spawns === 0.
  - `[low]` `[patch]` JSDoc « version comptée » dupliqué — allégé sur behavioursFromArchive.

## Auto Run Result

Status: done

**Changement livré.** `hydrateKernel(archive, options?)` (`src/app/fork.ts`) matérialise un kernel vivant à un point N d'un run conservé, en re-réduisant le préfixe (`liveBehaviourSources`, extrait et partagé dans `src/app/replay.ts`) et en rechargeant chaque comportement maison via `behaviourComponent` + `kernel.load`. C'est le substrat neuf load-bearing du fork (AD-49) : `kernel.replace` a désormais une cible.

**Fichiers.**
- `src/app/fork.ts` (nouveau) — `hydrateKernel` + `HydrateOptions`.
- `src/app/replay.ts` — extraction de `liveBehaviourSources(events, stopAt?)`, réutilisé par le rejeu et le fork ; `behavioursFromArchive` le consomme (comportement inchangé).
- `src/app/__tests__/fork.spec.ts` (nouveau) — 13 tests (matrice I/O + N intermédiaire + rollback à l'activation + v3 + valide+orphelin).

**Revue (4 couches).** 8 patchs appliqués (2 medium, 6 low), 1 report différé (rollback + isolat disposé), 3 rejets (fetchSource inerte en v1, casts `as` conformes au dépôt, ordre du fixture correct). Aucun intent_gap, aucun bad_spec.

**Follow-up review recommandé : true** — patchs : 0 high, 2 medium, 6 low ; score `3×2 + 1×6 = 12 ≥ 5`.

**Vérification.** `pnpm test` 285/285, `pnpm type-check` vert, `pnpm lint` vert.

**Risque résiduel.** Voir le report différé : un rollback restaure le slot mais pas l'isolat disposé d'un comportement feuille ; le cas courant (remplacement refusé à la compilation) sert pleinement la version précédente.
