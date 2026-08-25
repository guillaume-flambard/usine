## Why

L'atelier promet « importe/rejoue la trajectoire d'un agent qui a planté »
(`docs/7-MIGRATION.md`), mais aujourd'hui seuls les runs enregistrés *par
l'atelier lui-même* sont rejouables : `readArchive` (`src/app/replay.ts`)
n'accepte que le format interne `RunArchive` (version 1). Une équipe qui a un
agent en prod ne peut donc pas apporter sa vraie trajectoire cassée — elle doit
d'abord la rejouer dans notre monde, ce qui vide la promesse. Ce changement
ouvre la porte d'entrée : ingérer une trace étrangère (LangGraph, OTLP) et la
traduire vers le flux `RunEvent` que le moteur sait déjà rejouer et mesurer.

## What Changes

- **Nouvel adaptateur d'import** : un module qui prend une trace étrangère
  (export JSON LangGraph ; spans OTLP) et produit un `RunArchive` valide
  (version 1), rejouable par le moteur existant sans le toucher.
- **Normalisation du temps** : les horodatages absolus de la source deviennent
  des `at` élapsés depuis le premier événement (invariant AD-33 : un événement
  ne porte jamais de date absolue).
- **Frontière d'honnêteté explicite, câblée** : une trace importée ne porte
  aucun `build.source` de comportement. Elle est donc **rejouable, inspectable
  et mesurable, mais pas forkable** en v1 (le fork exige de recompiler le
  comportement, AD-49). L'import marque l'archive comme *étrangère* pour que
  l'UI n'offre pas « Forker ce run » et ne laisse pas croire au hot-swap d'un
  agent qu'on ne peut pas ré-exécuter.
- **Refus sûr** : une trace non reconnue ou malformée est refusée (comme
  `readArchive` refuse déjà une archive hostile), jamais devinée à moitié.
- Pas de nouvelle dépendance réseau ni d'exécution de code étranger sur le fil
  de la page (règle d'architecture 3 intacte).

## Capabilities

### New Capabilities
- `trace-import`: ingérer une trace d'agent étrangère (LangGraph, OTLP) et la
  traduire vers un `RunArchive` interne valide, avec le temps normalisé en `at`
  élapsé, marquée comme étrangère (donc rejouable/mesurable mais non forkable),
  ou refusée si elle n'est pas reconnue.

### Modified Capabilities
<!-- Aucune : le rejeu, le fork et la mesure ne changent pas de contrat. L'adaptateur
     est purement en amont de RunArchive ; le marqueur « étrangère » est additif. -->

## Impact

- **Code neuf** : `src/app/import/` (un adaptateur par source + un point
  d'entrée qui détecte le format et délègue), et un champ additif optionnel sur
  `RunArchive` marquant l'origine étrangère (défaut : interne, rétrocompatible).
- **UI** : la porte « Forker ce run » est masquée pour une archive étrangère ;
  un chemin d'import minimal dans le composeur (charger un fichier de trace).
- **Tests d'abord** : un test par comportement (mapping des étapes, ordre,
  normalisation du temps, refus d'une trace inconnue, archive résultante
  rejouable de bout en bout, non-forkable).
- **Hors périmètre (Deferred, cf. spine fork AD-41 / garde-fous d'honnêteté)** :
  re-exécution d'agents étrangers (checkpoint + runner réseau-gated) qui, seule,
  rendrait une trace importée forkable ; compensation d'effets de bord externes.
