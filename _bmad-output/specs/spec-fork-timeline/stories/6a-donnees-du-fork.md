---
title: 'Données du fork pour les deux panneaux (story 6a)'
type: feature
created: '2026-08-24'
status: 'done'
route: 'one-shot'
---

# Données du fork pour les deux panneaux (6a)

## Intent

**Problem:** Le panneau à deux futurs (story 6) doit montrer **deux applications
vivantes** côte à côte, tronc et branche. La branche a déjà ses comportements
(depuis son kernel) mais pas d'écran ; le tronc est un recording sans kernel —
il n'exposait ni comportements recompilés ni écran à N. Couche de données de la
story 6, avant l'UI.

**Approach:** (a) `behavioursFromArchive(archive, spawn?, stopAt?)` gagne un
`stopAt` (délègue à `liveBehaviourSources(events, stopAt)`), pour recompiler les
comportements du tronc **à N**. (b) `pilot.fork` enrichit `Trunk` avec
`behaviours` (recompilés à N) + `screen` (réduit du préfixe), et `Branch` avec
`screen` (réensemencé depuis le tronc à N — le store de branche ne porte pas le
préfixe). Décision : le panneau du tronc montre son application recompilée à N.

## Suggested Review Order

1. [replay.ts](../../../../src/app/replay.ts) — `behavioursFromArchive` gagne `stopAt`.
2. [pilot.ts](../../../../src/orchestration/pilot.ts) — `Trunk.behaviours`/`Trunk.screen`, `Branch.screen`, et l'enrichissement dans `fork`.
3. [fork.spec.ts](../../../../src/orchestration/__tests__/fork.spec.ts) — test : comportements du tronc recompilés à N répondent, écran du tronc à N, écran de branche réensemencé.

_Ctrl+clic (Cmd+clic sur macOS) sur les liens pour sauter à chaque étape._
