---
title: 'Comparaison mesurée tronc vs branche (port client)'
type: feature
created: '2026-08-24'
status: 'done'
route: 'one-shot'
---

# Comparaison mesurée tronc vs branche (port client)

## Intent

**Problem:** « Quelle branche est meilleure » doit se lire d'un **écart mesuré**,
pas d'un jugement (CAP-7, AD-40). Le harnais existe en Python
(`evaluation.py::measure`) mais opère sur les runs conservés côté service ; une
branche vivante n'est pas stockée, et l'atelier se veut gratuit et hors ligne.

**Approach:** Porter `measure()` en TypeScript (`src/app/measure.ts`,
`measureRun(archive) -> RunMeasure`), fidèle au Python (mêmes champs, `firstScreenAt`
en rang 1-based, `served` = écran ET comportement, `rollbacks`/`malformed` sur le
champ `kind`). Ajouter `measureDelta(trunk, branch)` pour l'écart d'un champ. La
version Python reste l'autorité pour les rapports d'ensemble sur les runs
conservés (décision : calcul **client-side**, cohérent avec la frugalité). Le
panneau de comparaison (story 6) consommera `measureRun` sur l'archive du tronc
et sur `branch.stream()`.

## Suggested Review Order

1. [measure.ts](../../../../src/app/measure.ts) — `measureRun` (port fidèle) + `measureDelta`.
2. [measure.spec.ts](../../../../src/app/__tests__/measure.spec.ts) — run servi (agents/remplacement/tokens/firstScreenAt), non-servi, rollback/malformed sur `kind`, comportement non compté en agent, `measureDelta`.

_Ctrl+clic (Cmd+clic sur macOS) sur les liens pour sauter à chaque étape._
