# Design — Forker la timeline (atelier de pré-prod)

> Compagnon lisible de `ARCHITECTURE-SPINE.md` (les invariants font foi). Écrit
> le 2026-08-24. Source : `docs/7-MIGRATION.md`. Décision : le fork importe des
> **traces externes** ; Fast path, revu en adversarial.

## Ce qu'on construit

Un atelier où l'on **rejoue** la trajectoire d'un agent qui a échoué, on
**forke** à l'instant du problème, on **change l'agent à chaud sur la branche**,
et on regarde **deux futurs diverger côte à côte** sous porte humaine — avant de
pousser en prod. Argument : *« teste le correctif sur la vraie trajectoire qui a
planté, en dix secondes, avant de déployer. »*

## La découverte qui a recadré le design

La revue adversariale a tranché une confusion coûteuse : **une trace n'est pas un
checkpoint.**

- Une **trace** (LangSmith, spans OTLP) est de l'**observabilité en lecture
  seule** — une photo de ce qui s'est passé. On peut la rejouer pour *montrer*
  le tronc, pas la reprendre.
- **Ré-exécuter** un agent depuis N exige un **checkpoint reprenable** + le
  graphe + les outils + le modèle + un environnement à **réseau ouvert**. Or le
  bac à sable maison a justement le réseau **retiré** (AD-29), et les effets
  externes ne sont **pas** annulables (AD-41).

Conséquence : on ne re-exécute pas un agent LangGraph « depuis une trace ». Le
design honnête sépare donc deux choses (AD-37, AD-48) :

| | Tronc | Branche |
|---|---|---|
| Nature | *recording* rejoué (visualisation) | **exécution neuve** enregistrée |
| Kernel | aucun (store seul) | un kernel hydraté (AD-49) |
| Source | trace importée (LangGraph/OTLP) | l'élément modifié, ré-exécuté |
| Rejouable | oui (c'est un enregistrement) | après coup, jamais identique au tronc |

## Le chemin v1 (buildable) vs le chantier lourd (Deferred)

- **v1 :** la branche ré-exécute des **comportements maison** — leur source est
  déjà dans le flux (`build.source`) — via le hot-swap réversible existant
  (AD-31) sur un **kernel hydraté depuis le préfixe** (AD-49). Import de traces
  externes = **visualisation du tronc** d'abord.
- **Deferred :** re-exécuter un vrai agent étranger (checkpoint + runner
  réseau-gated via le relais AD-34) ; compensation d'effets externes (sagas).
  Nommés, pas cachés.

## Le mécanisme, en un flux

```mermaid
sequenceDiagram
  participant U as Utilisateur
  participant A as Adaptateur (src/adapters)
  participant P as Pilote (mode fork)
  participant T as Tronc (store, sans kernel)
  participant B as Branche (kernel hydraté + store)
  U->>A: importe une trace (LangGraph/OTLP)
  A->>A: valide (donnée hostile) + assigne les sequence
  A->>P: flux canonique [1..fin]
  P->>T: rejoue le préfixe [1..N] (recording)
  U->>P: forke à N + modifie un élément
  P->>B: hydrate un kernel depuis [1..N] (AD-49)
  B->>B: branch-forked {trunkId, N} ; ré-exécute ; s'enregistre
  Note over T,B: deux read models isolés, axes alignés par l'offset de fork
  U->>B: valide / rejette CETTE branche (porte par branche)
  P->>P: compare deux RunMeasure (tronc vs branche)
```

## Les invariants qui portent (voir la spine)

- **Hérités** : état hors du remplaçable (AD-30), remplacement réversible avec
  enfants (AD-31), rejeu depuis le flux (AD-33).
- **Neufs** : import par adaptateur (AD-35), fork au `sequence` N (AD-36),
  tronc-lecture / branche-exécution (AD-37), deux read models isolés (AD-38),
  porte par branche (AD-39), comparaison mesurée (AD-40), honnêteté du périmètre
  (AD-41), trace hostile (AD-42), identité `branchId` runtime (AD-43), clé
  `(branchId, sequence)` + `branch-forked` (AD-44), préfixe = tableau partagé
  re-réduit (AD-45), temps élapsé-depuis-le-fork (AD-46), rejet = teardown entier
  (AD-47), tronc sans kernel (AD-48), **kernel hydraté depuis le préfixe** (AD-49,
  le seul substrat vraiment neuf).

## Les deux mensonges à ne jamais dire (AD-41)

1. Le rollback est **intra-runtime** — il ne défait pas un effet externe. On
   **prévient avant** (porte + branche sandbox), on ne répare pas après.
2. On tient **une primitive** (réversibilité + fork visuel), jamais une
   « plateforme de fiabilité » ni un « control plane ». Le wahou est un atout de
   démo ; le marché prouvé est la simulation/qualité d'agents.

## Prochaines étapes

1. `bmad-spec` / `bmad-create-epics-and-stories` : découper l'AD-49 (hydratation
   kernel) et le chemin v1 (comportements maison) en stories.
2. Confirmer l'`[ASSUMPTION]` du premier format (LangGraph vs OTLP tronc-only).
3. Puis `bmad-build` par story, sur la primitive hydratation d'abord.
