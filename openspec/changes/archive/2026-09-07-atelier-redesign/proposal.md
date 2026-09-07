## Why

**Priorité : P1 (vitrine).**

L'atelier est la pièce phare, mais à l'écran on ne comprend pas ce qu'il fait. Au
chargement, la scène est un grand carré blanc ; la conversation est écrasée dans
un rail étroit ; le composeur propose trois exemples de jargon conformité
(« Allégations santé », « Publicité trompeuse », « Relecture juridique ») qui
n'apprennent rien. Pendant un run, le cadre « application vivante » reste souvent
vide et laisse croire à un produit cassé. La prouesse — forker la trajectoire,
remplacer l'agent à chaud, faire diverger deux futurs — est déjà bâtie
(`ForkView.vue`) mais enterrée derrière un bouton après un run complet.

Résultat : le premier regard dit « wireframe vide », pas « atelier ». Voir =
comprendre = acheter ; ici on ne voit rien.

## What Changes

- **Scène toujours lisible et honnête.** Avant un run, la scène porte un
  explicatif bref des trois temps (besoin → fabrication en direct → fork/diff
  avant prod), qui s'efface dès le démarrage. Pendant, le graphe, la porte et
  l'application se partagent une scène rééquilibrée. Quand l'écranier n'a rien
  posé, un état honnête « l'application n'a rien posé » remplace le cadre blanc.
- **Fork au centre du récit.** Le geste « Forker ce run » et son *pourquoi*
  (tester un correctif sur la vraie trajectoire qui a planté) sont remontés et
  explicités dans la scène.
- **Composeur épuré.** Suppression des trois exemples de jargon. Champ vide + une
  accroche claire + le rappel d'honnêteté « sans modèle, rien ne sort ». Une
  seule entrée « voir un run enregistré » garde le site sans clé vivant.
- **Lift visuel.** Échelle typo affirmée, hiérarchie nette, accent rouille
  intentionnel, espacements « designés » — sur les jetons existants, sans
  nouvelle palette ni cinquième zone.

## Capabilities

### New Capabilities
- `scene-legibility`: la scène présente un contenu utile et honnête dans chaque
  état (intro avant run, fabrication, porte, application ou vide honnête) et
  remonte le fork et son pourquoi, sans jamais introduire de cinquième zone ni de
  faux squelette.
- `composer-clarity`: composeur sans exemples de jargon (champ vide + accroche),
  rappel d'honnêteté conservé quand aucun modèle n'est branché, et une unique
  entrée « voir un run enregistré » pour que le site sans clé ne soit pas muet.

### Modified Capabilities
<!-- Aucune capability existante ne change de contrat : la refonte porte sur des
     états de scène et de composeur nouveaux, pas sur le moteur, le rejeu, la
     tenancy ou l'import. -->

## Impact

- **Code touché (front uniquement) :** `src/ui/FactoryApp.vue` (shell, scène,
  composeur), `src/ui/LiveApplication.vue` (état vide honnête), `src/examples/`
  (suppression des exemples), et les jetons/styles de design.
- **Honnêteté (garde-fous docs/7) :** l'intro est de l'onboarding statique,
  jamais un faux squelette de run ; chaque élément de run reste payé par un
  événement réel ; le rollback reste intra-runtime — on ne laisse pas croire
  l'inverse (AD-41).
- **Coordination :** recouvre l'intention du capability planifié `onboarding`
  (`onboarding-and-docs`) sur le premier regard, et **remplace** son « exemple
  fourni » par « champ vide + run enregistré ». À réconcilier si les deux changes
  avancent en parallèle.
- **Hors périmètre :** rendre les panneaux du fork *spectaculaires* dépend du
  cœur qui émette un artefact réel (aujourd'hui l'application sort souvent vide).
  C'est une change cœur distincte ; celle-ci rend l'atelier lisible et honnête,
  pas le cœur plus productif.
