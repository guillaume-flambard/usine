---
title: 'Hot-swap d''un comportement maison sur la branche'
type: feature
created: '2026-08-24'
status: 'done'
route: 'one-shot'
---

# Hot-swap d'un comportement maison sur la branche

## Intent

**Problem:** Les stories 3+4 rendent le hot-swap sur la branche **possible** (le
kernel hydraté accepte `kernel.replace`), mais un appelant devait atteindre le
kernel, retrouver l'id du composant et compiler lui-même le comportement. Il
manquait l'API ergonomique de la story (CAP-5).

**Approach:** Ajouter `branch.replace(name, code): Promise<boolean>` sur l'objet
`Branch` (`src/orchestration/pilot.ts`). Il suit la version vivante de chaque
comportement, compile `behaviourComponent` (v+1), retrouve le composant actif
qui porte `behaviourKey(name)`, et appelle `kernel.replace` avec la même
métadonnée `build` qu'un run. Rend `false` si le nom est inconnu, si le code ne
compile pas, ou si le remplacement retombe — auquel cas la version précédente
continue de servir (rollback du kernel, AD-31). Le tronc n'est jamais touché
(AD-38). Groupé avec 3+4 côté livraison, isolé côté PR.

## Suggested Review Order

1. [pilot.ts](../../../../src/orchestration/pilot.ts) — l'interface `Branch.replace` et son implémentation dans `fork` (suivi de version, lookup du porteur, `kernel.replace`).
2. [fork.spec.ts](../../../../src/orchestration/__tests__/fork.spec.ts) — 3 cas : remplacement qui prend (branche en v3, tronc inchangé), nom inconnu → false, code qui ne compile pas → false et v2 sert encore.

_Ctrl+clic (Cmd+clic sur macOS) sur les liens pour sauter à chaque étape._
