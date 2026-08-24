---
id: SPEC-fork-timeline
companions:
  - '../../planning-artifacts/architecture/architecture-fork-timeline-2026-08-24/ARCHITECTURE-SPINE.md'
  - '../../planning-artifacts/architecture/architecture-fork-timeline-2026-08-24/SOLUTION-DESIGN.md'
sources:
  - '../../../docs/7-MIGRATION.md'
---

> **Contrat canonique.** Ce SPEC et les fichiers de `companions:` forment le
> contrat complet, validé en préservation, de ce qu'il faut construire, tester
> et valider. La spine (`ARCHITECTURE-SPINE.md`) fait foi sur les invariants
> (AD-*) ; ce SPEC les traduit en capacités livrables.

# Fork de timeline — chemin v1

## Why

`docs/7-MIGRATION.md` fait pivoter le produit vers **l'atelier de pré-prod qui
forke la timeline** : le marché ne paie pas « un logiciel qui mue », il paie pour
**ne pas avoir peur de changer ses agents en prod** (Gartner : >40 % des projets
d'agents annulés d'ici 2027 pour coût/risque). La seule vraie prouesse du stack —
rejouer, forker, remplacer à chaud, revenir en arrière proprement sous porte
humaine — rend cette peur regardable et gérable. La spine a établi les
invariants ; ce SPEC cadre le **chemin v1 buildable** : forker un run **maison**
et faire diverger deux futurs, en réutilisant le moteur existant. Le seul
substrat réellement neuf est l'hydratation d'un kernel depuis un préfixe de flux
(AD-49) ; tout le reste est du câblage additif.

## Capabilities

- **CAP-1 — Hydratation kernel depuis un préfixe de flux**
  - **intent:** Le système peut matérialiser un kernel vivant reflétant l'état à
    un événement N d'un run conservé, pour qu'un remplacement à chaud y opère.
  - **success:** Après hydratation à N, `liveBehaviours(kernel)` correspond au
    modèle de lecture réduit sur `[1..N]`, et un `kernel.replace` sur un composant
    hydraté émet `component-replaced` et restaure la version précédente avec ses
    enfants en cas d'échec (AD-31/49).

- **CAP-2 — Rejeu borné jusqu'à N**
  - **intent:** Le système peut rejouer un flux conservé jusqu'à un point N
    adressable par `sequence`, puis rendre la main.
  - **success:** `replayInto(archive, sink, { stopAt: N })` émet exactement les
    événements de `sequence ≤ N`, dans l'ordre, et rapporte le point atteint ;
    un rejeu à N est déterministe (AD-33/36).

- **CAP-3 — Mode fork du pilote**
  - **intent:** Le pilote peut, à partir d'un run conservé et d'un point N,
    exposer un **tronc** (lecture) et une **branche** (exécution) coexistants.
  - **success:** Après `pilot.fork(archive, N)`, le tronc est un store **sans
    kernel** (recording) et la branche a **son** kernel hydraté + store isolé ;
    les deux modèles de lecture sont distincts et n'interfèrent pas (AD-37/38/48).

- **CAP-4 — Identité de branche dans le flux**
  - **intent:** Une branche et ses événements sont identifiables et rejouables
    sans ambiguïté.
  - **success:** La branche a un `branchId` opaque minté par le runtime (AD-43) ;
    ses événements portent la clé `(branchId, sequence)` (AD-44) ; son premier
    événement `branch-forked` porte `{trunkId, N}` ; le préfixe `[1..N]` est un
    tableau partagé re-réduit par chaque côté (AD-45) ; `at` de branche est
    élapsé-depuis-le-fork avec offset enregistré (AD-46).

- **CAP-5 — Hot-swap d'un comportement maison sur la branche**
  - **intent:** Sur la branche, un comportement (dont la source est dans le flux)
    peut être remplacé à chaud à partir de N, sans toucher au tronc.
  - **success:** Remplacer un comportement sur la branche fait répondre la
    nouvelle version dans le panneau branche pendant que le tronc continue de
    servir l'ancienne ; un remplacement raté laisse la version précédente servir
    (AD-31/37).

- **CAP-6 — Scène à deux panneaux, porte par branche**
  - **intent:** Le visiteur voit tronc et branche côte à côte et décide du sort
    de la branche.
  - **success:** Deux panneaux (chacun son graphe / son application) divergent
    visiblement ; chaque branche porte **sa** porte (valide/rejette) ; rejeter
    défait la branche entière (kernel+store+session) avec rétractation visible,
    le tronc restant intact (AD-38/39/47).

- **CAP-7 — Comparaison mesurée des branches**
  - **intent:** Le visiteur peut voir, mesuré, en quoi la branche diffère du
    tronc.
  - **success:** Un bandeau diffe deux `RunMeasure` (`evaluation.py`
    `measure(archive) -> RunMeasure`) entre tronc et branche ; aucune branche
    n'est déclarée gagnante autrement que par cet écart (AD-40).

## Constraints

- **Garde-fou 1 (AD-41) :** le rollback est *intra-runtime* — il ne défait pas
  un effet externe. L'UI vend « prévenir avant » (porte + branche sandbox),
  jamais « réparer après ».
- **Garde-fou 2 (AD-41) :** se présenter comme **une primitive** (réversibilité
  + fork visuel), jamais « plateforme de fiabilité » ni « control plane ».
- **Invariants hérités :** état hors du remplaçable (AD-30), remplacement
  prend/rend la main + restaure avec enfants (AD-31), rejeu depuis le flux avec
  `at` élapsé (AD-33).
- **Réutiliser le moteur :** `RunEvent`, `kernel.performReplacement`, réducteur
  pur, un store par run ; **seul `src/runtime/` importe cordis** ; ne pas
  rebuilder le runtime.
- **Discipline :** tests d'abord (un test par piège) ; code en anglais
  (identifiants, fichiers, descriptions de tests) ; doc, narration et UI en
  français ; quatre zones, la divergence se montre *dans* la scène.

## Non-goals

- **Import de traces externes** (adaptateur LangGraph/OTLP) — la v1 forke un run
  **maison** ; l'adaptateur et le schéma canonique viennent après (AD-35).
- **Re-exécution d'agents étrangers** (checkpoint reprenable + runner à réseau
  ouvert, gated par le relais) — chantier lourd, distinct du Worker (AD-29).
- **Compensation d'effets externes** (sagas / undo réel hors runtime) — hors
  périmètre (AD-41).
- **Tenue à l'échelle** (dizaines de nœuds vivants × deux branches) — non visée
  en v1.

## Success signal

Sur un run maison conservé, le visiteur forke à un point choisi, remplace un
comportement à chaud sur la branche, et voit **deux futurs diverger côte à côte**
— chacun sous sa porte — sans que le tronc bouge ; l'écart entre les deux est
**mesuré** (diff de `RunMeasure`), et un lien de partage **rejoue** la branche à
l'identique depuis son seul flux.

## Open Questions

- Premier format d'entrée confirmé maison v1, mais quel format externe viser en
  premier ensuite (LangGraph traces/checkpoint vs OTLP tronc-only) reste ouvert.
- L'UI à deux panneaux tient-elle la contrainte des quatre zones sans en ajouter
  une cinquième, ou faut-il un mode « scène dédoublée » ? (à trancher au design
  d'implémentation avec `DESIGN.md`).
