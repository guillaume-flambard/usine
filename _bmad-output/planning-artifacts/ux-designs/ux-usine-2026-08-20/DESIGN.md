---
name: Memo Labs — L'usine agentique
status: final
created: '2026-08-20'
updated: '2026-08-21'
sources:
  - _bmad-output/planning-artifacts/prds/prd-usine-2026-08-20/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-usine-2026-08-20/ARCHITECTURE-SPINE.md
  - src/assets/tokens.css
  - src/assets/app.css
colors:
  background: '#faf9f7'
  surface: '#ffffff'
  on-background: '#16130f'
  on-surface-variant: '#6b6055'
  outline: '#e7e2da'
  outline-strong: '#16130f'
  grid: 'rgba(22, 19, 15, 0.042)'
  primary: '#ad4c16'
  on-primary: '#ffffff'
  primary-soft: '#e58a4a'
  state-idle: '#6b6055'
  state-waiting: '#6b6055'
  state-running: '#ad4c16'
  state-done: '#16130f'
  state-error: '#8c2f10'
  state-released: '#b9b1a7'
typography:
  display:
    fontFamily: Oswald
    fontSize: 20px
    fontWeight: '400'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  body:
    fontFamily: Oswald
    fontSize: 14px
    fontWeight: '300'
    lineHeight: '1.55'
  label:
    fontFamily: Oswald
    fontSize: 11px
    fontWeight: '400'
    lineHeight: '1.2'
    letterSpacing: 0.14em
    textTransform: uppercase
  status:
    fontFamily: Oswald
    fontSize: 12px
    fontWeight: '300'
    letterSpacing: 0.04em
rounded:
  all: '0px'
spacing:
  unit: '4px'
  gutter: '24px'
  stack: '14px'
components:
  button:
    padding: '8px 16px'
    border: '1px solid'
    radius: '0'
  field:
    padding: '8px 10px'
    border: '1px solid'
    radius: '0'
  node:
    width: '140px'
    stroke: '1px'
    radius: '0'
---

# L'usine agentique — identité visuelle

> **Révisé le 2026-08-21.** Le produit a changé de nature depuis la première
> version de ce document : il ne livre plus un outil à la fin d'un run, il
> **sert une application pendant le run et la réécrit sous les doigts du
> visiteur**. La moitié des composants décrits ici n'existait pas. Ce qui suit
> décrit ce qui est à l'écran aujourd'hui, et surtout **ce qui ne doit pas
> disparaître dans une refonte**.

---

## Brand & Style

Un atelier qui montre une machine, pas une startup qui en vend une.

Le produit fait une chose : le visiteur écrit un besoin, et des agents qui
n'existaient pas font naître une application utilisable en quelques secondes —
puis **la remplacent à chaud pendant qu'il s'en sert**, sans qu'il perde ce
qu'il a fait. Le moment qui porte tout, c'est une étiquette de version qui
passe de `v1` à `v2` sous les yeux du visiteur, et une ligne qui dit
*« 3 remplacements à chaud · 0 redémarrage · 11 interactions conservées »*.

Tout le vocabulaire visuel doit servir ce moment. Ce qui ne le sert pas est du
décor, et le décor est ce que ce produit refuse : il prétend montrer un système
réel, et une interface qui simule de l'activité le contredit à l'écran.

**Ton** — éditorial, aéré, précis. Phrases courtes. Aucun superlatif. Une
erreur ne s'excuse pas et ne reste pas vague.

### Un avertissement avant de redessiner

La palette actuelle — crème `#faf9f7`, encre presque noire, accent terracotta
`#ad4c16`, display condensé, coins carrés — est **littéralement l'un des trois
looks vers lesquels le design assisté par IA converge aujourd'hui**. Elle n'est
pas mauvaise ; elle n'est simplement pas un choix, c'est un défaut. Si une
seule chose mérite d'être dépensée dans cette refonte, c'est celle-là.

Deuxième faiblesse du même ordre : **Oswald porte tout** — titres, corps,
chiffres, libellés. Une famille condensée pour du texte courant à 14 px est un
compromis, pas une décision. Un vrai appariement — une display avec du
caractère, une famille de lecture confortable, une monospace pour le code et
les chiffres — changerait la page plus que n'importe quelle couleur.

Ce qui **ne se renégocie pas** : le thème unique et clair, les coins carrés,
l'absence d'ombre et de dégradé, un seul niveau d'accent.

---

## Colors

| Rôle | Valeur | Emploi |
|---|---|---|
| `background` | `#faf9f7` | Le fond de la page, peint explicitement. |
| `surface` | `#ffffff` | Le cadre de l'application, les panneaux du bas, les champs. |
| `on-background` | `#16130f` | Le texte, et le trait fort d'un nœud terminé. |
| `on-surface-variant` | `#6b6055` | Auteurs, libellés, ligne d'état, notes. Tout ce qui situe sans être lu en premier. |
| `outline` | `#e7e2da` | Le trait par défaut : bordures, séparateurs, nœuds au repos. |
| `outline-strong` | `#16130f` | Le trait d'un élément qui demande une décision. |
| `primary` | `#ad4c16` | **Un seul emploi à la fois** : ce qui travaille en ce moment. Un nœud en cours, une arête qui transporte, une erreur. |
| `primary-soft` | `#e58a4a` | Le halo d'une arête active, rien d'autre. |
| `grid` | `rgba(22,19,15,0.042)` | La grille de fond du canvas. Doit rester à la limite du perceptible. |

### Les six états d'un nœud

Ce sont les seuls états du graphe, et **aucun n'a le droit d'être porté par la
couleur seule** — c'est une exigence d'accessibilité, et c'est aussi ce qui
rend une capture d'écran lisible en noir et blanc.

| État | Couleur | Signal non coloré |
|---|---|---|
| inactif | `state-idle` | trait fin, opacité réduite |
| en attente de dépendance | `state-waiting` | trait en pointillés |
| en cours | `state-running` | trait épaissi, marque pleine |
| terminé | `state-done` | trait plein foncé |
| en erreur | `state-error` | marque en croix |
| libéré | `state-released` | libellé barré, opacité forte |

---

## Typography

Une seule famille aujourd'hui : **Oswald**, en 300 pour le corps et 400 pour
ce qui étiquette. C'est le point faible nommé plus haut.

| Rôle | Taille | Graisse | Emploi |
|---|---|---|---|
| `display` | 20 px | 400 | Le nom du produit, un titre de panneau. Rare. |
| `body` | 14 px | 300 | Les messages du fil, les explications. |
| `label` | 11 px | 400, +0.14em, capitales | Auteur d'un message, clé d'un compteur, éveil de section. |
| `status` | 12 px | 300, +0.04em | La ligne d'état, les notes discrètes. |

**Règle** : un libellé situe, il ne titre pas. L'auteur d'un message ne doit
jamais peser plus que ce qu'il a dit.

---

## Layout & Spacing

**Une application plein écran, `100vh`, qui ne défile jamais.** Ni
horizontalement, ni verticalement. Seuls défilent le fil de conversation, le
canvas dans son cadre, et un panneau du bas trop haut.

Quatre zones, et pas une de plus. La version précédente en comptait quatorze,
parce que chaque fonctionnalité s'était vu attribuer sa propre boîte — c'est
l'erreur à ne pas refaire.

```
┌──────────────────────────┬────────────────────────────────────────────┐
│  ① marque + état         │                                            │
│  ● modèle du site ·      │              ③ la scène                    │
│  construction · 4 agents │                                            │
│  ─────────────────────── │   ┌── chantier · 8 agents · 3 remplac… ──┐ │
│                          │   │   (le graphe, replié par défaut)     │ │
│  ② la conversation       │   └──────────────────────────────────────┘ │
│                          │                                            │
│  MAÎTRE                  │                                            │
│  Lit le besoin.          │                                            │
│                          │                                            │
│  ARTISAN                 │   ┌──────────────────────────────────────┐ │
│  « compter » passe en v2 │   │  ④ l'application, ou la porte        │ │
│  sans redémarrage.       │   │  (feuille du bas, au-dessus)         │ │
│  ─────────────────────── │   └──────────────────────────────────────┘ │
│  ③ le composeur          │                                            │
│  [ un besoin…      ] [▶] │                                            │
└──────────────────────────┴────────────────────────────────────────────┘
```

**① Marque et état.** Une ligne. Le point du mode, la phase, le nombre
d'agents, le temps, les tokens. « détail » déplie l'explication du mode, les
sources branchables, le sélecteur de modèle. Rien de tout ça n'occupe l'écran
en permanence.

**② La conversation.** Ce que les agents disent, du plus ancien au plus
récent, qui suit ce qui arrive. C'est la seule chose à lire.

**③ Le composeur, en bas**, là où l'on écrit. Le champ, les exemples en petit
tant qu'il est vide, le bouton à droite, `⌘↵` pour lancer.

**④ La scène.** Le graphe, et par-dessus lui une feuille du bas : la porte
humaine, puis l'application. L'application est le protagoniste, le graphe est
la preuve — **ils ne sont jamais à parité**.

**Rythme** — unité de 4 px, gouttière de 24 px, interligne de bloc de 14 px.

---

## Elevation & Depth

Il n'y en a pas. Aucune ombre, aucun dégradé, un seul poids de trait.

La seule superposition du produit est la **feuille du bas** — porte humaine et
application — qui recouvre le bas du canvas. Elle se distingue par sa surface
blanche et un filet supérieur, jamais par une ombre portée. Le canvas se réserve
la place au lieu d'être coupé.

---

## Shapes

Coins carrés partout, sans exception : boutons, champs, nœuds, panneaux.

Les arêtes du graphe sont des courbes fines. Les nœuds sont des rectangles de
140 px de large à trait de 1 px. La seule forme non rectangulaire du produit
est la marque d'état d'un nœud.

---

## Components

Ce que cette section décrit n'est pas décoratif : chacun de ces composants
**porte une affirmation que le produit doit tenir**.

### Message du fil
Auteur en `label` au-dessus, message en `body` en dessous. Aucun encadré,
aucun numéro de séquence — c'était une vue de débogage.

### Ligne d'état
Un point coloré pour le mode, puis des faits séparés par des points médians.
Elle remplace cinq boîtes ; elle ne doit jamais redevenir un tableau.

### Composeur
Champ de deux lignes, exemples cliquables **qui écrivent dans le champ sans
lancer** — le visiteur doit voir le texte s'inscrire et pouvoir le corriger,
sinon la preuve que rien n'est préenregistré tombe. Bouton éteint tant que le
champ est vide.

### Nœud du graphe
Rectangle, libellé en capitales, étiquette de technologie **seulement si cette
technologie tourne réellement derrière**. Un composant fabriqué pendant le run
se distingue visuellement d'un composant préexistant.

### Résumé du graphe
Une ligne cliquable qui remplace le graphe une fois que l'application sert :
`chantier · 8 agents · 3 remplacements à chaud · 0 redémarrage`. Elle se déplie
à la demande, et reste dépliée si le visiteur l'a ouverte.

### Cadre de l'application
Une iframe sablée, d'origine opaque, à trait fin sur surface blanche. Le
balisage qu'elle affiche a été écrit par un agent pendant le run.

### Créneau inerte
Une commande dont le comportement n'existe pas encore : bouton éteint, mention
*« en construction »* à côté. **Il doit s'allumer tout seul** quand l'agent le
publie, et s'éteindre si le composant disparaît. C'est la dépendance réactive
rendue visible à quelqu'un qui ignore ce qu'est une dépendance — c'est le
composant le plus important de la liste.

### Étiquette de version
`v2` à côté du nom du comportement. Elle change **pendant** que le visiteur
regarde. Si une refonte la rend discrète au point qu'on ne voit pas le
changement, elle a raté l'essentiel.

### Compteur de survie
`3 remplacements à chaud · 0 redémarrage · 11 interactions conservées`. Les
trois nombres viennent du runtime, jamais d'une estimation. Le zéro est la
moitié de l'affirmation et doit rester affiché.

### Porte humaine
Deux boutons de **poids visuel strictement égal** — le produit ne pousse pas
vers l'approbation. Au-dessus : ce qui existe, l'objection du sceptique, et ce
que chaque geste coûte, écrit avant le clic.

---

## States

Tout élément à l'écran doit être **payé par un événement réel du run**. Aucun
squelette, aucune barre de progression, aucun cadre de graphe vide en attente :
ce sont exactement les artifices que le produit prétend remplacer.

| État | Ce qui est à l'écran |
|---|---|
| au repos | La marque, la ligne d'état, un fil vide qui invite, le composeur. Rien d'autre. |
| amorçage | Le raisonnement du maître arrive dans le fil, à mesure. C'est ce qui occupe l'attente. |
| premier écran | L'application apparaît, créneaux inertes annoncés. Cible : moins de 15 s. |
| en vie | Les comportements s'allument un par un, les versions montent, le graphe se replie. |
| porte | Emporter ou écarter, avec le coût de chacun. |
| emporté | Le fichier, le lien de rejeu, la suite. |

### Les états d'échec sont des états normaux

Ils seront majoritaires tant que la capacité est ce qu'elle est. Chacun a son
écran, dit ce qui s'est passé, et propose la suite.

| Situation | Ce qu'on montre |
|---|---|
| relais muet, pas de clé | bandeau honnête, bascule en rejeu d'un run enregistré |
| capacité du jour épuisée | le compteur, et le rejeu proposé |
| crédit à zéro | idem, jamais un 502 |
| le modèle répond hors forme | compté et affiché, le run continue |
| aucune application produite | dit tel quel, sans habillage, avec le fil pour comprendre |
| un comportement lève ou boucle | le créneau affiche l'incident, **la version précédente continue de servir** |

---

## Do's and Don'ts

**Faire**

- Payer chaque élément par un événement réel. Une animation exprime un fait du
  moteur, ou elle n'existe pas.
- Laisser l'application dominer la scène. Le graphe est une preuve, pas un
  spectacle : il fascine vingt secondes, l'application s'utilise.
- Dire ce qui manque. Un refus nomme ce qui est possible ; un vide dit quoi
  faire ; une erreur dit quoi corriger.
- Garder les deux gestes de la porte à poids égal.
- Tenir la ligne d'accessibilité : contrastes AA, parcours au clavier, état
  jamais porté par la couleur seule, `prefers-reduced-motion` respecté sans
  perte d'information.

**Ne pas faire**

- Un bloc visible par fonctionnalité. C'est l'erreur qui a produit quatorze
  zones ; elle revient dès qu'on ajoute une capacité sans se demander où elle
  vit.
- Un squelette, un compte à rebours, une barre de progression. Le produit
  refuse de simuler l'activité.
- Un champ de brief pré-rempli et soumis tel quel : la preuve que rien n'est
  enregistré d'avance repose sur le fait que le visiteur a tapé.
- Une étiquette de technologie sur un nœud qui ne l'exécute pas.
- Un second niveau d'accent. Une seule couleur dit « ceci travaille ».
- Une ombre, un dégradé, un coin arrondi, un thème sombre.

---

## Ce qu'une refonte ne peut pas changer

Ces contraintes viennent de l'architecture, pas du goût. Une maquette qui les
ignore ne sera pas implémentable.

- **L'application vit dans une iframe sablée d'origine opaque.** La page hôte
  ne peut ni lire ni styler son contenu. Ce qui est à l'intérieur est habillé
  par une feuille de style que nous servons avec le cadre ; ce qui est à
  l'extérieur est la page. Les deux se ressemblent, ils ne se partagent rien.
- **Le balisage de l'application est écrit par un modèle**, puis assaini contre
  une liste blanche. On ne peut pas compter sur une structure précise à
  l'intérieur du cadre — seulement sur les commandes, les saisies et les zones
  de réponse.
- **Le graphe se dispose tout seul** en couches de gauche à droite, et sa
  taille n'est pas connue d'avance. Il tient dans son cadre par un `viewBox`.
- **La page ne défile jamais.** Toute maquette plus haute que l'écran est une
  maquette à revoir.
