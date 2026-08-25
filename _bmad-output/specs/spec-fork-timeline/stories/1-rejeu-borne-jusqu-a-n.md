---
title: 'Rejeu borné jusqu''à un événement N'
type: feature
created: '2026-08-24'
status: 'done'
route: 'one-shot'
---

# Rejeu borné jusqu'à un événement N

## Intent

**Problem:** Le fork de timeline a besoin de rejouer un flux conservé **jusqu'à
un point N** (le point de fork), puis de rendre la main — or `replayInto`
rejouait toujours le flux entier et ne rapportait rien d'exploitable (un simple
booléen). Story 1 du fork (CAP-2, AD-33/36).

**Approach:** Ajouter une option `stopAt` (un `sequence`) à `replayInto` : elle
n'émet que les événements de `sequence <= stopAt`, dans l'ordre, sans muter le
préfixe, puis rend la main. La fonction rapporte désormais un `ReplayOutcome`
`{ reachedEnd, lastSequence }` — jusqu'où le rejeu est allé et s'il a atteint la
fin. Le seul appelant (`pilot.replay`) ignorait déjà la valeur de retour, donc
l'enrichissement ne casse personne. Le bornage se fait par `sequence` (adressable
et stable, AD-36), déterministe car un flux relu est trié (AD-33).

## Suggested Review Order

1. [src/app/replay.ts](../../../../src/app/replay.ts) — `ReplayOptions.stopAt`, `ReplayOutcome`, et le bornage dans `replayInto` (le cœur).
2. [src/app/__tests__/replay.spec.ts](../../../../src/app/__tests__/replay.spec.ts) — 10 cas : au milieu, bornes (1 et dernier), au-delà de la fin, 0, négatif, flux vide, déterminisme, interruption (déjà avortée + en cours de pace).

_Ctrl+clic (Cmd+clic sur macOS) sur les liens pour sauter à chaque étape._
