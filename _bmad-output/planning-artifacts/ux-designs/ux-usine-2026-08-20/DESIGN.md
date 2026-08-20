---
name: Memo Labs — L'usine agentique
status: final
created: '2026-08-20'
updated: '2026-08-20'
sources:
  - docs/3-CLAUDE-DESIGN-BRIEF.md
  - docs/0-DECISIONS.md
  - src/assets/usine.css
  - _bmad-output/planning-artifacts/prds/prd-usine-2026-08-20/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-usine-2026-08-20/ARCHITECTURE-SPINE.md
colors:
  background: '#faf9f7'
  surface: '#ffffff'
  on-background: '#16130f'
  on-surface: '#16130f'
  on-surface-variant: '#6b6055'
  outline: '#e7e2da'
  outline-strong: '#16130f'
  grid: 'rgba(22, 19, 15, 0.042)'
  primary: '#ad4c16'
  on-primary: '#ffffff'
  primary-soft: '#e58a4a'
  inverse-surface: '#16130f'
  inverse-on-surface: '#faf9f7'
  state-idle: '#6b6055'
  state-waiting: '#6b6055'
  state-running: '#ad4c16'
  state-done: '#16130f'
  state-error: '#8c2f10'
  state-released: '#b9b1a7'
typography:
  display-lg:
    fontFamily: Oswald
    fontSize: 64px
    fontWeight: '700'
    lineHeight: '0.95'
    letterSpacing: -0.03em
    textTransform: uppercase
  display-md:
    fontFamily: Oswald
    fontSize: 40px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: -0.02em
    textTransform: uppercase
  numeric-lg:
    fontFamily: Oswald
    fontSize: 32px
    fontWeight: '400'
    lineHeight: '1.0'
    letterSpacing: -0.01em
  narration:
    fontFamily: Oswald
    fontSize: 22px
    fontWeight: '300'
    lineHeight: '1.35'
  body-md:
    fontFamily: Oswald
    fontSize: 16px
    fontWeight: '300'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Oswald
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.45'
  node-label:
    fontFamily: Oswald
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.04em
    textTransform: uppercase
  eyebrow:
    fontFamily: Oswald
    fontSize: 11px
    fontWeight: '400'
    lineHeight: '1.4'
    letterSpacing: 0.2em
    textTransform: uppercase
  mono-inline:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
rounded:
  DEFAULT: 0
  sm: 0
  md: 0
  lg: 0
  full: 0
spacing:
  unit: 8px
  gutter: 24px
  pane-gap: 1px
  panel-padding: 24px
  node-width: 140px
  node-height: 56px
  layer-gap: 178px
  row-gap: 96px
  grid-cell: 72px
  hairline: 1px
components:
  button-primary: 'fond ink, texte background, hover fond primary, coins carrés, uppercase eyebrow'
  button-ghost: 'trait outline 1px, texte on-surface-variant, hover bordure outline-strong'
  node: 'rectangle 140×56, trait 1px, fond surface, label node-label, technologie body-sm en on-surface-variant'
  edge: 'courbe de Bézier 1px, outline au repos, primary quand une valeur transite'
  panel: 'fond surface, trait 1px outline, aucune ombre'
  field: 'trait 1px outline, focus outline 2px primary, fond surface'
---

## Brand & Style

Memo Labs montre une machine. Le design n'est pas là pour l'habiller, il est là pour la rendre lisible — puis pour s'effacer.

Le style est **minimalisme éditorial** appliqué à un outil : la retenue typographique d'un studio d'impression, la précision d'un logiciel professionnel. La référence sensible est un atelier propre et bien éclairé, pas un tableau de bord. Beaucoup de vide, un seul accent, des traits fins, aucune profondeur simulée.

Le ton visuel tient en une phrase, et elle est contractuelle : **comme un studio qui montre une machine impressionnante sans esbroufe.**

L'impression forte est un objectif assumé du produit — mais elle doit venir de ce qui se passe réellement à l'écran : un système qui se construit sous les yeux du visiteur, la largeur des technologies qu'il mobilise vraiment, et le basculement final vers un outil qui marche. **Toute animation exprime un événement réel du moteur.** Un mouvement qui ne dit rien du système est un défaut, pas une finition.

## Colors

La palette est courte et ne s'élargit pas.

- **Crème `#faf9f7`** — le fond, toujours peint explicitement. Chaud, non clinique.
- **Encre `#16130f`** — un quasi-noir chaud. Tout le texte, et l'état « terminé » d'un nœud.
- **Muted `#6b6055`** — un gris chaud pour le second plan : technologies, légendes, états inactifs.
- **Trait `#e7e2da`** — les filets. Le squelette du produit est fait de traits, pas de blocs.
- **Terracotta `#ad4c16`** — l'accent unique. Il signifie **une seule chose : ça se passe maintenant.** Nœud en cours, arête active, eyebrow, focus. Ne jamais l'employer pour décorer.
- **Terracotta doux `#e58a4a`** — un second souffle, réservé aux dégradés d'attention discrets et aux survols.
- **Grille `rgba(22, 19, 15, 0.042)`** — une trame de fond de 72 px, à la limite du perceptible. Elle donne l'échelle sans se voir.

Les états de nœud empruntent à cette palette et n'en sortent pas : inactif et en attente en muted, en cours en terracotta, terminé en encre, en erreur en `#8c2f10` (une terracotta assombrie, pas un rouge d'alerte étranger au système), libéré en `#b9b1a7`.

**La couleur ne porte jamais seule une information.** Chaque état a aussi une forme, un trait ou un mot.

## Typography

**Oswald partout**, chargé depuis Google Fonts, avec une pile de repli système. Une seule famille, sept rôles.

Le condensé d'Oswald fait beaucoup de travail : il permet des titres énormes qui tiennent dans la largeur, et des labels de nœud lisibles à 13 px dans un rectangle de 140 px.

- **Titres** — uppercase, 600 à 700, interlettrage négatif serré. Ils forment un bloc visuel, pas une ligne de texte.
- **Eyebrows** — uppercase, 11 px, interlettrage large à 0.2em, en terracotta. C'est la signature Memo Labs.
- **Narration** — 22 px, poids 300. Une phrase calme, jamais un terminal.
- **Corps** — 300 à 400. Le poids 300 est le défaut ; le 400 sert quand la taille descend.
- **Labels de nœud** — uppercase, 500, interlettrage léger. Assez de graisse pour tenir à petite taille sur un trait fin.
- **Chiffres** — Oswald 400 en grand pour les compteurs. Les chiffres sont un objet visuel du produit, pas une note de bas de page.
- **Monospace en ligne** — la seule entorse à Oswald, réservée au code d'un composant fabriqué et aux noms d'API. Le code doit se lire comme du code.

## Layout & Spacing

**Application plein écran, 100vh.** Le corps de page ne défile jamais. C'est la contrainte structurante : ce n'est pas une page, c'est un outil.

Deux volets séparés par un filet d'un pixel :

- **Gauche** — le brief, le lancement, la narration et le fil des messages. Largeur confortable pour de la lecture, jamais dominante.
- **Droite** — le panneau vivant : le graphe, les compteurs, puis le produit livré. C'est le foyer.

L'unité de base est 8 px. Les nœuds font 140 × 56, espacés de 178 px entre couches et de 96 px entre rangées — assez pour que les courbes respirent. Le padding des panneaux est de 24 px, et il ne se resserre pas : la densité n'est pas une valeur ici.

Ce qui a été **supprimé** de la version antérieure du design : le hero, le titre géant d'accueil, la largeur de contenu à 920 px, les sections espacées de `clamp(120px, 18vw, 240px)`. Ces éléments appartenaient à une page éditoriale. Le produit est une application.

## Elevation & Depth

Il n'y a pas de profondeur. **Aucune ombre, aucun dégradé, aucun flou.**

La hiérarchie se fait par trois moyens seulement : le **trait** (un filet d'un pixel sépare, un trait encre affirme), le **vide** (l'espace fait plus de travail que n'importe quel contour) et le **poids typographique**.

Un panneau se distingue du fond par son fond blanc `#ffffff` sur la crème et par son filet. Rien d'autre. Si un élément a besoin d'une ombre pour exister, c'est que sa place est mauvaise.

## Shapes

**Rayon zéro. Partout, sans exception.** Boutons, panneaux, champs, nœuds, blocs de code.

Le carré est l'affirmation la plus forte du système et la moins coûteuse. Il vient du bouton « GET IN TOUCH » de memolabs.dev et il tient tout le reste ensemble.

Les traits font 1 px, parfois 0,5 px sur les filets décoratifs les plus discrets. Les seules courbes du produit sont les **arêtes du graphe** — des Bézier fines. Ce contraste est délibéré : tout est droit, sauf ce qui relie.

## Components

- **Bouton primaire** — fond encre, texte crème, uppercase en eyebrow, généreux horizontalement. Au survol, le fond passe en terracotta. C'est le seul élément plein du produit.
- **Bouton fantôme** — filet 1 px, texte muted, bordure encre au survol. Sert aux actions secondaires et aux deux boutons de la porte humaine, qui sont de poids égal — le produit ne pousse pas à approuver.
- **Champ de brief** — filet 1 px, fond blanc, focus en contour terracotta 2 px. Aucun placeholder décoratif : le champ est déjà rempli d'un vrai besoin.
- **Nœud** — rectangle 140 × 56, filet 1 px, fond blanc, label uppercase, et une technologie en muted **seulement si ce nœud l'exécute réellement**. Un nœud fabriqué pendant le run porte un filet doublé et une pastille carrée en terracotta.
- **Arête** — Bézier de 1 px en trait, qui passe en terracotta pendant qu'une valeur transite. Elle se dessine à l'apparition, elle ne clignote pas.
- **Panneau** — fond blanc, filet 1 px, padding 24 px, aucune ombre. Sert au détail d'un nœud, à l'artefact, au payoff.
- **Compteur** — un chiffre en Oswald 32 px, un label en eyebrow au-dessus. Aligné sur une même ligne de base que ses voisins.
- **Ligne de narration** — une seule ligne, 22 px, poids 300, sur la crème sans conteneur. Elle est le texte le plus grand de la moitié gauche.
- **Bloc de code** — monospace, fond blanc, filet 1 px. Le seul endroit où Oswald cède.
- **Indicateur de mode** — un eyebrow en muted, en permanence, avec une pastille carrée : creuse en mode déterministe, pleine en terracotta en mode LLM branché.

## Do's and Don'ts

**À faire**

- Peindre le fond explicitement, toujours.
- Laisser le graphe être le seul foyer visuel de l'écran.
- Employer la terracotta pour dire « maintenant », et pour rien d'autre.
- Doubler chaque signal de couleur d'une forme ou d'un mot.
- Faire dire quelque chose à chaque animation : elle exprime un événement du moteur ou elle n'existe pas.
- Garder le vide. Quand un écran semble trop vide, c'est généralement qu'il est juste.

**À ne pas faire**

- Pas d'ombre, pas de dégradé, pas de coin arrondi, pas de flou.
- Pas de second accent. Pas d'arc-en-ciel d'états.
- Pas de terminal dense, pas de journal qui défile en continu au premier plan.
- Pas d'étiquette de technologie sur un nœud qui ne l'exécute pas : c'est un mensonge visuel et le produit se définit contre ça.
- Pas de compteur qui s'anime sans consommation réelle.
- Pas de hero, pas de section éditoriale, pas de défilement de page.
- Pas de mode sombre : le système est clair, assumé comme tel.
