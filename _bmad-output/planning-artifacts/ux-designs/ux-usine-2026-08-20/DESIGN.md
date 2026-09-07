---
name: Memo Labs — L'usine agentique
status: final
created: '2026-08-20'
updated: '2026-09-07'
sources:
  - _bmad-output/planning-artifacts/prds/prd-usine-2026-08-20/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-usine-2026-08-20/ARCHITECTURE-SPINE.md
  - node_modules/@nuxt/ui/dist/runtime/index.css
  - src/assets/app.css
system: '@nuxt/ui v4, en mode Vue, dans ses défauts'
tokens: 'portés par la bibliothèque — voir node_modules/@nuxt/ui/dist/runtime/index.css'
colors:
  # Le produit ne déclare aucune couleur. Ces noms sont ceux des jetons
  # sémantiques de la bibliothèque, et c'est par eux que le reste du document
  # désigne une couleur.
  background: 'var(--ui-bg)'
  surface: 'var(--ui-bg-elevated)'
  on-background: 'var(--ui-text)'
  on-surface-variant: 'var(--ui-text-muted)'
  outline: 'var(--ui-border)'
  outline-strong: 'var(--ui-border-accented)'
  primary: 'var(--ui-primary)'
  state-idle: 'var(--ui-text-muted)'
  state-waiting: 'var(--ui-text-muted)'
  state-running: 'var(--ui-primary)'
  state-done: 'var(--ui-text-highlighted)'
  state-error: 'var(--ui-error)'
  state-released: 'var(--ui-text-dimmed)'
typography:
  # Aucune police n'est chargée : la pile système, qui est le défaut réel de
  # la bibliothèque. Public Sans est la police de son site de documentation,
  # pas du paquet.
  sans: 'var(--font-sans) — pile système'
  mono: 'var(--font-mono) — pile système'
rounded:
  all: 'var(--ui-radius), 0.25rem par défaut'
---

# L'usine agentique — identité visuelle

> **Révisé le 2026-09-07 :** l'interface est repartie des défauts de Nuxt UI v4,
> sans thème. Le produit ne déclare plus ni couleur, ni police, ni rayon. Trois
> interdits de ce document sont levés, chacun avec sa raison — voir le tableau
> plus bas. Ce qui tient encore relève de l'honnêteté de ce qui est montré, pas
> de l'apparence.
>
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

### L'avertissement, et ce qu'on en a fait

> Ce document disait, le 2026-08-21 : la palette — crème `#faf9f7`, encre
> presque noire, accent terracotta `#ad4c16`, display condensé, coins carrés —
> « n'est pas mauvaise ; elle n'est simplement pas un choix, c'est un défaut ».
> Et : « **Oswald porte tout** — titres, corps, chiffres, libellés. Une famille
> condensée pour du texte courant à 14 px est un compromis, pas une décision. »

**Le 2026-09-07, l'avertissement a été suivi, et jusqu'au bout : tout a été
retiré.** Le produit ne déclare plus ni couleur, ni police, ni rayon. Il part
des défauts de la bibliothèque, et la personnalisation se décidera plus tard,
pour elle-même, sur une base propre.

C'est délibérément l'inverse d'un compromis. Repeindre par-dessus l'héritage
aurait produit un troisième défaut : celui qu'on garde parce qu'il était déjà
là. Repartir de zéro coûte une étape en plus et rend la décision visible.

Ce qui **ne se renégocie pas** ne concerne plus l'apparence, mais l'honnêteté
de ce qui est montré — voir *Ce qu'une refonte ne peut pas changer*, plus bas.
Trois anciens interdits sont donc levés, chacun avec sa raison :

| Interdit | État | Pourquoi |
|---|---|---|
| Thème clair unique | **levé** | Le mode couleur par défaut de la bibliothèque est actif : l'écran suit la préférence du visiteur. Le cadre sablé, lui, reste clair — il ne partage rien avec la page hôte, et sa feuille est servie avec lui. |
| Coins carrés | **levé** | `--ui-radius` vaut son défaut, 0,25 rem. Le remettre à zéro sera une ligne, le jour où la personnalisation se décidera. |
| Absence d'ombre | **levé** | Les composants portent l'élévation légère de la bibliothèque. La feuille du bas continue de se distinguer par sa surface et son filet supérieur, pas par une ombre portée. |
| Un seul niveau d'accent | **maintenu** | C'est une règle produit, pas une règle de goût : une seule couleur dit « ceci travaille ». Elle survit au changement de bibliothèque. |

---

## Colors

Le produit ne déclare aucune valeur. Il désigne les couleurs par les jetons
sémantiques de la bibliothèque, et les composants les prennent par ses classes
utilitaires — `text-muted`, `text-dimmed`, `text-highlighted`, `bg-elevated`,
`border-default`.

| Jeton | Emploi |
|---|---|
| `--ui-bg` | Le fond de la page et des surfaces. |
| `--ui-bg-elevated` | Ce qui se pose au-dessus : ligne d'état, blocs de code, pastilles. |
| `--ui-text` | Le texte courant. |
| `--ui-text-highlighted` | Ce qui doit se lire en premier, et le trait fort d'un nœud terminé. |
| `--ui-text-muted`, `--ui-text-dimmed` | Auteurs, libellés, notes. Tout ce qui situe sans être lu en premier. |
| `--ui-border` | Le trait par défaut : bordures, séparateurs, nœuds au repos. |
| `--ui-border-accented` | Le trait d'un élément qui demande une décision. |
| `--ui-primary` | **Un seul emploi à la fois** : ce qui travaille en ce moment. Un nœud en cours, une arête qui transporte. |
| `--ui-error` | Un nœud en erreur, un incident dans le fil. |

La grille de fond du canvas a disparu avec la palette maison. Si elle revient,
elle doit rester à la limite du perceptible.

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

**Aucune police n'est chargée.** La pile système, qui est le défaut réel de la
bibliothèque — `Public Sans` est la police de son site de documentation, pas du
paquet. Conséquence utile : la politique de sécurité n'a plus besoin
d'autoriser de fournisseur de polices, et rien n'est à auto-héberger.

Les tailles viennent de l'échelle de la bibliothèque, par ses classes
utilitaires. Trois rôles subsistent, décrits par leur emploi et non par une
valeur :

| Rôle | Emploi |
|---|---|
| titre | Le nom du produit, un titre de panneau. Rare. |
| corps | Les messages du fil, les explications. |
| libellé | Auteur d'un message, clé d'un compteur, éveil de section. Capitales, interlettré. |
| chiffres | Compteurs, durées, versions, écarts. En chasse fixe et en chiffres tabulaires, pour qu'une colonne s'aligne d'une ligne à l'autre. |

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
- **Une couleur, une police ou un rayon déclarés par le produit.** Tout passe
  par les jetons de la bibliothèque. *(Remplace, le 2026-09-07, l'ancienne
  ligne « une ombre, un dégradé, un coin arrondi, un thème sombre » : voir le
  tableau des interdits levés, plus haut.)*

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
- **Les jetons existent en trois copies, et l'isolation l'impose.** La page
  hôte, le cadre sablé, le fichier emporté hors ligne : aucun des deux derniers
  ne peut consommer une feuille externe. Ils portent leur copie, et un test
  node échoue quand elles divergent — ce qui est arrivé, sans que rien ne le
  signale.
