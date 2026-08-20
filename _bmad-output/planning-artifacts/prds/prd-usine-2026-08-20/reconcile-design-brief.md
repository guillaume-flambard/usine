# Réconciliation — docs/3-CLAUDE-DESIGN-BRIEF.md

Confronté à `prd.md` + `addendum.md`.

## Repris fidèlement
- Tokens du design system, Oswald, coins carrés, thème clair unique : PRD §10.
- Les quatre références d'interaction (n8n, Linear, Dust, Claude Desktop) : PRD §10.
- Narration en une ligne calme, pas un terminal : FR-026.
- Survol des nœuds, états visibles, arêtes qui s'animent : FR-018 à FR-020.
- Porte humaine à deux boutons : FR-029 à FR-032.
- Le graphe défile dans son conteneur, la page jamais horizontalement : FR-024.
- Payoff encadré et fonctionnel : F6.

## Écarts

### E8 — Conflit non tranché : page éditoriale contre application plein écran (majeur)
Le brief de design décrit une page éditoriale : barre de marque, **hero avec eyebrow terracotta et titre Oswald géant**, largeur de contenu ~920px, espacement de section `clamp(120px, 18vw, 240px)`. `0-DECISIONS` dit l'inverse, explicitement : « 100vh, app plein écran — PAS la page éditoriale qui scrolle ».

Le PRD §10 a retenu la version application sans jamais signaler que le brief de design dit autre chose. Un designer qui lit `3-CLAUDE-DESIGN-BRIEF.md` produira le mauvais écran. Le document doit être corrigé ou explicitement daté comme antérieur à la décision.

### E9 — Le ton a été perdu (qualitatif)
Le brief donne une phrase de ton qui vaut cahier des charges : « éditorial, aéré, confiant, précis. Comme un studio qui montre une machine impressionnante sans esbroufe. » Et : « le wahou vient du graphe qui pousse et de la breadth des technos et du payoff réel — pas d'effets décoratifs. »

Le PRD §10 ne porte que des tokens et des références. Le ton, qui est ce qui distingue ce produit d'un dashboard, n'est écrit nulle part dans le PRD.

### E10 — Détails de rendu non portés
Traits 0,5-1px, aucune ombre, aucun dégradé, grille de fond très subtile, un seul niveau d'accent, apparition des nœuds en fondu avec léger décalage. Le PRD ne retient que « un seul niveau d'accent ». Le reste est de la spécification visuelle et peut rester dans le brief — à condition que le brief soit corrigé (E8) et référencé comme contractuel.
