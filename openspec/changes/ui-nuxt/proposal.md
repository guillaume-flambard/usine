## Why

**Priorité : P1 (vitrine).** L'atelier est la pièce phare, et son interface est
tenue par du CSS qui a doublé sans jamais être purgé.

Les faits, mesurés le 2026-09-07 :

- `src/assets/app.css` fait 1205 lignes dans un seul espace de noms. Quatorze
  sélecteurs y sont déclarés deux fois ou plus (`.panel` quatre fois, `.thread`
  avec deux définitions contradictoires dont la seconde gagne en silence), et au
  moins treize ne stylent plus rien.
- Les jetons de couleur existent en **quatre copies divergentes** :
  `src/assets/tokens.css`, `sandbox.html`, `src/app/takeaway.ts`, et les valeurs
  de repli écrites en dur dans les composants. `--muted` vaut `#6b6055` dans deux
  fichiers et `#6b6560` dans les deux autres. `app.css` introduit un quatrième
  accent `#c4633a` en repli de l'action destructive, couleur qui n'existe nulle
  part ailleurs.
- Aucune primitive. Quatre idiomes de bouton concurrents (`.button`,
  `.button-ghost`, `.picker`, `.status-toggle`), et `.status-toggle` sert à la
  fois de disclosure, d'entrée de menu, d'onglet `role="tab"`, d'action
  destructive et de lien de téléchargement.
- Les quatre superpositions (`.gate`, `.product`, `.panel`, `.live-app`) ne sont
  pas des dialogues : pas de `role="dialog"`, pas de piège de focus, pas d'`inert`
  sur le fond, et `Escape` ne ferme que le panneau de nœud. Leurs hauteurs sont
  trois pourcentages magiques (60 %, 68 %, 34 %) pour la même place à l'écran.
- Le `role="tablist"` des runs n'a ni `tabpanel`, ni `aria-controls`, ni roving
  tabindex. Un commentaire d'`app.css` documente un contraste à environ 2:1, sous
  le seuil AA, et l'expédie quand même.
- Bug vivant : `FactoryApp.vue` écoute `@use-relay` et `@use-key` que
  `ModelSwitch.vue` n'émet jamais (il émet `connectRelay` et `connectKey`).
  **Coller une clé API et brancher le modèle ne fait rien**, et aucun test ne
  couvre ce composant.

Et le document de design du projet dit lui-même que la palette actuelle « n'est
pas mauvaise ; elle n'est simplement pas un choix, c'est un défaut », et que le
tout-Oswald est le second point faible.

## What Changes

- **Nuxt UI v4 en mode Vue/Vite** comme socle de composants. Pas de réécriture de
  framework : la bibliothèque s'installe dans une application Vue 3 + Vite pure.
  Elle apporte les primitives manquantes par Reka UI : dialogues conformes,
  onglets, champs, boutons à variantes.
- **Une seule source de jetons.** Les trois copies imposées par l'isolation des
  cadres restent, mais un test les compare : aujourd'hui elles divergent et rien
  ne le signale.
- **La direction visuelle se rouvre.** Appariement typographique à la place du
  tout-Oswald, palette retravaillée par les rôles, contrastes AA vérifiés.
- **`FactoryApp.vue` (971 lignes) est découpé** en shell plus composants de zone.
- **Le chemin clé API est réparé** et couvert par un test.

## Capabilities

### New Capabilities
- `ui-primitives`: les commandes et les superpositions de l'atelier viennent d'un
  seul système de composants ; un dialogue est un vrai dialogue (rôle, piège de
  focus, `Escape`, fond inerte) ; les onglets sont conformes ; aucun élément
  interactif ne dépend d'une classe de présentation pour être trouvé par un test.
- `visual-system`: les jetons de design ont une source unique, les trois copies
  imposées par l'isolation des cadres coïncident, les contrastes tiennent AA, et
  aucun état n'est porté par la couleur seule.

### Modified Capabilities
<!-- Aucun contrat existant ne change. `scene-legibility` et `composer-clarity`
     gardent leurs exigences : la refonte change ce qui les rend, pas ce
     qu'elles promettent. -->

## Impact

- **Code touché (front uniquement) :** `package.json`, `vite.config.ts`,
  `src/main.ts`, `src/App.vue`, `index.html`, `src/assets/tokens.css`,
  `src/assets/app.css`, les neuf composants de `src/ui/`, et les huit suites
  navigateur de `src/ui/__tests__/`.
- **Non touché :** `src/runtime/` et le moteur, `services/api`, `services/relay`
  (gelé), le flux d'événements, le format d'archive.
- **Honnêteté (garde-fous docs/7) :** aucun squelette, aucune barre de
  progression, aucun état porté par la couleur seule, porte humaine à deux gestes
  de poids strictement égal. La refonte ne peut pas les assouplir.
- **Documents amendés :** `EXPERIENCE.md` interdisait toute bibliothèque de
  composants ; `DESIGN.md` présentait le thème clair unique, les coins carrés et
  l'absence d'ombre comme non négociables. Les deux sont révisés par cette change,
  sinon la migration se lira comme une régression.
- **Hors périmètre :** les deux panneaux divergents côte à côte de la cible
  `docs/7-MIGRATION.md`. La refonte est **dessinée pour** les accueillir ; les
  construire est une change distincte.
