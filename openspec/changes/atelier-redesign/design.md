## Context

Le shell (`FactoryApp.vue`, ~950 lignes) tient déjà les quatre zones (marque +
état, conversation, composeur, scène) et l'atelier (`ForkView.vue`) est complet :
deux cadres, édition d'un comportement, « faire diverger », bandeau de
comparaison mesuré, porte à deux gestes. Le problème n'est pas l'absence de
fonctions mais leur illisibilité : proportions, états vides, jargon, fork
enterré. Les jetons de design existent (`--surface`, `--line`, `--muted`,
`--ink`, `--accent #ad4c16`).

## Goals / Non-Goals

**Goals:**
- La scène ne lit jamais « cassé/vide » : chaque état montre quelque chose
  d'utile et honnête.
- On comprend en cinq secondes ce que fait l'usine, sans avoir lancé.
- Le fork et son pourquoi sont visibles dans le parcours, pas cachés.
- Composeur épuré, sans jargon, sans mentir sur le mode sans modèle.
- Lecture « produit designé », pas wireframe.

**Non-Goals:**
- Faire produire au cœur un artefact réel dans les panneaux (change cœur
  séparée — c'est aujourd'hui un travail de diagnostic, pas un spec propre).
- Un tour guidé interactif ou de la doc produit (relève d'`onboarding-and-docs`).
- Nouvelle palette : on reste sur les jetons existants.
- Cinquième zone : interdit (docs/7) ; la divergence vit dans la scène.

## Decisions

- **Intro de scène = onboarding statique, pas un run factice.** Avant `started`,
  la scène rend un bloc explicatif des trois temps. *Alt. écartée* : un faux
  graphe / skeleton — viole la règle d'honnêteté « chaque élément à l'écran doit
  être payé par un événement réel du run ». L'intro n'est pas un run : c'est du
  texte de cadrage, retiré au démarrage.
- **État « application vide » honnête dans `LiveApplication`.** Quand
  `screen.markup` est vide, afficher un état nommé plutôt qu'un cadre blanc.
  *Alt. écartée* : masquer l'application et ne montrer que le graphe — perd le fil
  et le geste d'emport.
- **Rééquilibrage par la grille `.app`.** La conversation gagne une largeur mini
  confortable ; la scène ne domine que quand elle porte du contenu. Structure des
  composants inchangée — pas de refonte de l'arbre, juste des proportions, une
  échelle typo et des espacements.
- **Fork remonté.** Le `@fork` de `LiveApplication` gagne un intitulé + une phrase
  de pourquoi ; le bandeau d'honnêteté intra-runtime de `ForkView` reste tel quel.
- **Composeur : suppression de `EXAMPLES`.** Le champ démarre vide ; l'accroche
  existante reste ; l'entrée « voir un run enregistré » rejoue l'archive de démo
  (couplage `briefReplayable` / `demoReasoner` conservé, sans exposer un besoin
  jargon à l'utilisateur).

## Risks / Trade-offs

- **Site sans clé muet.** Virer les exemples retire l'amorce en un clic ; mitigé
  par l'unique entrée « run enregistré ».
- **Sur-promesse de l'atelier.** Les panneaux peuvent rester vides tant que le
  cœur ne produit rien ; assumé par un état honnête, pas par un cadre blanc.
- **Chevauchement avec `onboarding`.** Décision explicite de remplacement du
  « exemple fourni » ; à réconcilier si les deux changes coexistent.
- **Refonte visuelle subjective.** Mitigé par l'itération dans le preview live et
  le respect strict des jetons ; les tests navigateur existants
  (`shell.browser.spec.ts`, `fork-view.browser.spec.ts`) encadrent la géométrie
  et l'honnêteté et sont étendus plutôt que réécrits ; les captures de référence
  (`__screenshots__`) sont régénérées.

## Migration Plan

Pas de migration de données ni de contrat. Changement purement front, réversible
par revert. Aucune action infra.

## Open Questions

- Garde-t-on l'entrée « voir un run enregistré » (défaut retenu : oui, pour ne
  pas laisser le site public muet), ou virer *vraiment* tout ?
- L'intro de scène : texte seul, ou un mini-schéma statique des trois temps ?
