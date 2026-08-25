## Context

Voir `proposal.md — Why`. État actuel : `src/app/replay.ts` définit `RunArchive`
(version 1, `{version, brief, events}`) et `readArchive`, qui n'accepte que ce
format. Le moteur rejoue un flux `RunEvent` (`src/runtime/events.ts`) réduit par
un réducteur pur (`src/state/reducer.ts`). Seul `src/runtime/` importe cordis
(règle d'architecture 1) ; le flux est le format d'archive (règle 2, AD-33) ; le
code étranger ne s'exécute jamais sur le fil de la page (règle 3). Le fork exige
de recompiler la source d'un comportement portée par `build.source` (AD-49) —
une trace étrangère n'en a aucune.

## Goals / Non-Goals

**Goals:**
- Un adaptateur en amont de `RunArchive` : trace étrangère → `RunArchive`
  valide, rejouable par le moteur sans le modifier.
- Détection de format + délégation à un adaptateur par source (LangGraph, OTLP).
- Marquer l'archive comme étrangère de façon rétrocompatible.

**Non-Goals (design-level):**
- Aucune modification du réducteur, du noyau, du pilote, ni du contrat de fork.
- Aucun nouvel événement `RunEvent` : l'import ne réutilise que le vocabulaire
  existant ; ce qui ne s'y projette pas est laissé de côté, pas inventé.
- Aucune re-exécution de l'agent étranger (Deferred).

## Decisions

- **Adaptateur en amont, moteur intact.** L'import produit un `RunArchive`
  standard ; `readArchive`, le rejeu, la mesure ne changent pas. *Alternative
  écartée* : un second chemin de rejeu pour traces étrangères — dédoublerait le
  moteur et ferait diverger deux formats (même piège que « deux relais »).
- **Marqueur d'origine additif et optionnel.** Ajouter `origin?: 'foreign'` à
  `RunArchive` (absent = interne). Rétrocompatible : les archives v1 existantes
  restent valides sans bump de version. L'UI lit ce champ pour masquer le fork.
  *Alternative écartée* : bump `ARCHIVE_VERSION` — casserait toutes les archives
  stockées pour un champ purement additif.
- **Mapping conservateur vers le vocabulaire existant.** Chaque étape/span de la
  source se projette sur `component-created` / `component-activated` /
  `message-emitted` / `work-finished` / `component-failed` selon ce que la
  source expose. Ce qui n'a pas d'équivalent est ignoré, jamais forcé.
- **Temps normalisé à l'import.** L'ancre est le premier stamp ; `at = stamp -
  ancre`. Aucune date absolue n'entre dans le flux (AD-33). `sequence`
  ré-attribué en ordre chronologique croissant.
- **Refus par défaut.** Détection stricte : format non reconnu ou champs
  manquants → échec explicite, aucune archive. Même posture que `readArchive`
  face à une donnée hostile.
- **Frontière d'honnêteté câblée, pas seulement documentée.** `origin:'foreign'`
  → pas de `build.source` → le fork rejetterait de toute façon (AD-49) ; l'UI
  masque « Forker ce run » en amont pour ne rien promettre (AD-41).

## Risks / Trade-offs

- **Trace pauvre en structure** (spans plats sans arêtes agent→agent) → le
  graphe sera maigre. *Mitigation* : projeter honnêtement ce qui existe ; ne pas
  fabriquer d'arêtes. Un graphe maigre reflète une trace maigre.
- **Formats source instables** (schémas LangGraph/OTLP évoluent). *Mitigation* :
  un adaptateur isolé par source, testé sur un échantillon figé ; l'ajout d'un
  format n'en casse pas un autre.
- **Attente déçue « j'ai importé, je peux forker ».** *Mitigation* : le masquage
  du fork est une exigence testée, pas un choix d'UI ; message clair que le fork
  d'un agent étranger est Deferred (nécessite un runner de ré-exécution).
- **Fichier de trace volumineux.** *Mitigation* : import côté client, parsing
  borné ; hors périmètre l'optimisation, mais refuser proprement au-delà d'une
  taille plutôt que planter.

## Migration Plan

Purement additif : nouveau module `src/app/import/`, champ optionnel sur
`RunArchive`. Aucune migration de données. Rollback = retirer le point d'entrée
d'import ; les archives internes existantes ne sont pas touchées.
