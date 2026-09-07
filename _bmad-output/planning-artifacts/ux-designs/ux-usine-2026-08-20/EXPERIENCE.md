---
name: Memo Labs — L'usine agentique
status: final
created: '2026-08-20'
updated: '2026-09-07'
design: ./DESIGN.md
sources:
  - _bmad-output/planning-artifacts/prds/prd-usine-2026-08-20/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-usine-2026-08-20/ARCHITECTURE-SPINE.md
  - docs/3-CLAUDE-DESIGN-BRIEF.md
---

# EXPERIENCE — L'usine agentique

L'identité visuelle vit dans [DESIGN.md](./DESIGN.md) ; les tokens y sont référencés par leur nom, sous la forme `{colors.primary}`. En cas de conflit avec une maquette, un import ou une capture, **les deux spines gagnent**.

## Foundation

**Facteur de forme** — application web plein écran, 100vh. Pas d'application native, pas de mode hors ligne. *(Révisé le 2026-09-07 : le thème clair unique n'est plus une règle — le mode couleur par défaut de la bibliothèque est actif, et l'écran suit la préférence du visiteur. Les comptes existent depuis, voir le PRD.)*

**Système d'interface** — **Nuxt UI v4, en mode Vue, dans ses défauts.** *(Révisé le 2026-09-07 ; cette ligne disait « aucun ».)*

L'interdit avait une raison : une bibliothèque impose son vocabulaire visuel, et le produit voulait le sien. Il a été levé sur un constat mesuré, pas sur une préférence. Le CSS maison avait doublé sans être purgé — 1205 lignes dans un seul espace de noms, six sélecteurs déclarés deux fois, quatre idiomes de bouton concurrents, et surtout **quatre superpositions qui n'étaient pas des dialogues** : ni `role="dialog"`, ni piège de focus, ni fond inerte. Écrire soi-même un dialogue accessible est précisément ce qu'on écrit mal, et on l'avait écrit mal quatre fois.

Le produit ne déclare donc plus ni couleur, ni police, ni rayon : la bibliothèque les porte. La personnalisation viendra, mais sur une base propre, décidée pour elle-même plutôt que négociée contre un héritage.

Reste écrit à la main ce qu'aucune classe utilitaire ne dit : la mise en page plein écran, la scène et ses feuilles du bas, et le graphe — du SVG, dont les six états portent chacun un signal qui n'est pas la couleur. Le calcul de coordonnées reste délégué à `@dagrejs/dagre`. Le tout vit dans `src/assets/app.css`, 268 lignes. *(L'ancien renvoi vers `src/assets/usine.css` pointait vers un fichier disparu depuis longtemps.)*

**Contrainte structurante** — le corps de page ne défile **jamais**. Tout ce qui dépasse défile dans son propre conteneur. Cette règle prime sur toute considération de contenu : si quelque chose ne tient pas, on le met dans un conteneur défilant ou on le coupe, jamais on n'allonge la page.

**Ce que l'expérience doit produire** — trois convictions, dans cet ordre : *ça se construit vraiment sous mes yeux*, *je peux ouvrir et vérifier*, *l'outil final marche sur mon propre texte*.

## Information Architecture

Une seule surface, deux volets, quatre panneaux qui apparaissent par-dessus le volet droit sans jamais quitter l'écran.

| Surface | Rôle | Apparaît |
| --- | --- | --- |
| **Volet gauche — conduite** | Barre de marque, indicateur de mode, champ de brief, bouton de lancement, ligne de narration, fil des messages | Toujours |
| **Volet droit — panneau vivant** | Compteurs, puis le graphe | Toujours |
| **Détail de nœud** | Rôle, dépendances, coeffects, messages, état, artefact produit | Sur sélection d'un nœud |
| **Spécification et code** | Ce dont un composant fabriqué découle et ce qui tourne | Sur sélection d'un nœud fabriqué |
| **Porte humaine** | Objet de la décision, objection du sceptique, deux boutons | Quand le run l'atteint |
| **Produit livré** | Le vérificateur d'allégations | Après approbation |

**Fermeture** — chaque besoin exprimé dans le PRD atterrit sur une de ces six surfaces, et chaque surface est atteinte par au moins un des trois parcours ci-dessous. La mémoire de run et le journal complet sont accessibles depuis le volet gauche, en repli, sans surface propre : ce sont des dépliants, pas des écrans.

**Ce qui n'existe pas** — pas de navigation, pas d'en-tête de site, pas de pied de page, pas de menu, pas de page « à propos ». Un visiteur ne peut pas se perdre parce qu'il n'y a nulle part où aller.

## Voice and Tone

Le microcopy est **factuel, court, en français, jamais enthousiaste.** Le produit ne se félicite pas.

- **Le bouton dit ce qu'il fait** : « Lancer l'usine », « Approuver », « Écarter », « Vérifier les allégations ». Pas de « C'est parti ! », pas de « Magique ».
- **La narration est à la troisième personne, au présent** : « L'architecte choisit la stack. » « Le constructeur de règles compile le vérificateur. » Un agent ne dit jamais « je ».
- **Une erreur nomme le fait, pas l'émotion** : « L'outil registre n'a pas pu se charger. Les agents qui en dépendent restent en attente. » Jamais « Oups » ni « Quelque chose s'est mal passé ».
- **Le mode est décrit sans excuse** : « Mode déterministe — les agents composent et fabriquent réellement ; leur jugement est écrit à la main, pas produit par un modèle. » On dit la limite, on ne s'en excuse pas.
- **Le verdict de conformité est neutre** : « Autorisé », « Interdit », « À vérifier », suivis de la source. Jamais « Attention ! » ni pictogramme d'alarme.
- **Le point de contact est sobre** : « Vous voulez voir ça sur votre catalogue ? » Une phrase, après le premier résultat.

## Component Patterns

Le comportement seulement ; l'apparence vit dans [DESIGN.md](./DESIGN.md).

> Référence visuelle : [mockups/run-en-cours.html](./mockups/run-en-cours.html) — le run à 38 secondes (quatre états de nœud simultanés, un composant fabriqué en attente) et la porte humaine. **Les spines gagnent sur la maquette** en cas de désaccord ; la maquette illustre, elle ne décide pas.

**Nœud** — révélé à sa place définitive, jamais repositionné. Survol : rôle en une ligne, dépendances, technologie si elle est réelle. Sélection : ouvre le détail et met le nœud en évidence ; les arêtes entrantes et sortantes s'épaississent. Un nœud n'est jamais déplaçable par l'utilisateur — le graphe n'est pas un éditeur.

**Arête** — se dessine à l'apparition du nœud cible. Passe en `{colors.primary}` pendant qu'une valeur transite réellement, revient à `{colors.outline}` ensuite. Une arête ne pulse pas en boucle.

**Canvas** — déplaçable au glisser, zoomable à la molette et au clavier, zoom borné entre 50 % et 200 %. Un double-clic sur le vide recadre sur l'ensemble. Le canvas ne capture jamais le défilement de la page — il n'y en a pas.

**Ligne de narration** — affiche un seul message, remplacé par le suivant en fondu court. Elle ne s'empile pas et ne défile pas. Le fil complet est en dessous, dans un conteneur défilant, chaque message attribué et horodaté.

**Compteur** — la valeur change par transition numérique courte quand elle vient d'un événement réel. Le compteur de tokens en mode déterministe affiche `0` fixe : il ne s'anime pas, il ne fait pas semblant.

**Panneau** — s'ouvre par-dessus le volet droit, se ferme à l'échappement, au clic hors panneau, ou par sa croix. Un seul panneau à la fois. Ouvrir un panneau ne suspend jamais le run.

**Porte humaine** — deux boutons de **poids visuel égal**. Le produit ne pousse pas à approuver ; la décision est réelle ou elle ne vaut rien. Aucun délai ne franchit la porte tout seul.

**Champ de brief** — pré-rempli d'un vrai besoin, entièrement modifiable, jamais réinitialisé par le run en cours. Changer de scénario le remplace, et le dit.

**Vérificateur** — zone de texte libre, un bouton, une liste de résultats. Effacer et resoumettre ne relance pas le run. Chaque ligne de résultat porte son statut, sa source citée et l'origine du verdict.

## State Patterns

**Les six états de nœud**, chacun avec un signal qui n'est pas la couleur :

| État | Signal non chromatique | Couleur |
| --- | --- | --- |
| Inactif | trait fin, label en muted | `{colors.state-idle}` |
| En attente de dépendance | trait pointillé + mention « attend » au survol | `{colors.state-waiting}` |
| En cours | trait épaissi + indicateur d'activité discret | `{colors.state-running}` |
| Terminé | trait plein encre + coche fine | `{colors.state-done}` |
| En erreur | trait doublé + croix fine + message dans la narration | `{colors.state-error}` |
| Libéré | trait fantôme, opacité réduite, label barré | `{colors.state-released}` |

**Au chargement** — le graphe est vide, le champ est rempli, le bouton attend. Aucun squelette animé, aucun faux contenu : un écran calme qui n'a rien à cacher.

**Pendant le run** — le premier signe de vie apparaît en moins de 1,5 seconde. S'il tardait, l'écran ne montrerait pas de barre de progression mais le premier nœud en état « en cours » : le produit montre le travail, pas une attente.

**Erreur d'un composant** — le run ne s'arrête pas. Le nœud passe en erreur, la narration l'annonce, ses dépendants passent en attente et disent qu'ils attendent une dépendance qui ne viendra pas. Rien ne disparaît de l'écran.

**Rétractation** — écarter à la porte ne fige pas le graphe : les nœuds concernés passent en libéré, un par un, en ordre inverse. La rétractation est un spectacle au même titre que la construction, et elle est la preuve que la porte n'est pas décorative.

**Relance** — le graphe précédent se libère visiblement avant que le nouveau commence. On ne passe jamais d'un run à l'autre par un écran blanc.

**Vide du vérificateur** — avant toute soumission, la zone de texte est vide avec une indication d'une ligne de ce qu'on peut y coller. Aucun exemple pré-rempli : le visiteur doit taper son propre texte, c'est le cœur de la preuve.

## Interaction Primitives

- **Un seul geste engage un run** : le clic sur le bouton de lancement. Rien ne démarre tout seul au chargement de la page.
- **Le survol informe, le clic ouvre.** Aucun survol ne déclenche d'action.
- **Échappement ferme** le panneau ouvert, et rien d'autre. Il n'annule jamais un run.
- **Le clavier suit l'ordre de lecture** : brief, lancement, mode, puis le graphe comme groupe unique, puis les panneaux quand ils s'ouvrent. Les nœuds sont parcourables aux flèches à l'intérieur du groupe.
- **Le focus est toujours visible**, en contour `{colors.primary}` de 2 px, y compris sur les nœuds du SVG.
- **Aucune action destructive sans conséquence visible** : écarter libère, et le montre.
- **Aucune modale bloquante.** La porte humaine attend dans le flux, elle ne recouvre pas l'écran.

## Accessibility Floor

- **Contrastes AA** sur tous les textes et tous les états de nœud, y compris le muted sur crème et la terracotta sur blanc.
- **Aucune information portée par la seule couleur.** Chaque état a une forme, un trait ou un mot. Le test : passer l'écran en niveaux de gris, tout doit rester lisible.
- **Parcours critique entièrement au clavier** : lancer, approuver, écarter, utiliser le vérificateur. Sans exception et sans piège de focus.
- **Le graphe est un groupe accessible** — rôle applicatif, nom explicite, et une description textuelle alternative qui énumère les composants vivants et leurs liens. Un lecteur d'écran doit pouvoir savoir ce qui existe sans voir le dessin.
- **La narration est une région active polie** : les messages sont annoncés sans interrompre.
- **`prefers-reduced-motion`** : les nœuds apparaissent sans fondu ni décalage, les arêtes se dessinent instantanément, les compteurs sautent à leur valeur. **Aucune information n'est perdue** — l'ordre d'apparition reste le même, le run reste compréhensible.
- **Cibles de pointage** d'au moins 44 × 44 px sur les boutons, la porte comprise.
- **Zoom navigateur à 200 %** sans perte de fonction ni défilement horizontal du corps.

## Key Flows

### Camille, recruteuse technique — la preuve en une minute

Camille a trente-cinq profils à traiter. Elle ouvre le lien depuis un CV, entre deux réunions. Elle ne lira rien.

1. Elle voit un champ déjà rempli et un bouton. Aucune explication à lire.
2. Elle clique. En moins de 1,5 seconde, le premier nœud s'allume.
3. Le graphe pousse. Une ligne lui dit en français ce qui se passe, une phrase à la fois.
4. Le run s'arrête et lui demande d'approuver ou d'écarter, en lui montrant ce qui a été produit et ce que le sceptique a relevé.
5. Elle approuve. Un vérificateur apparaît.
6. **Climax** — elle colle une phrase marketing qu'elle invente sur le moment, et obtient un verdict par allégation avec le texte réglementaire cité. *Ce dernier écran ne pouvait pas être préenregistré : c'est elle qui a tapé la phrase.*

### Marc, lead engineer — le test du sceptique

Marc a vu des dizaines de démos d'agents. Sa question est toujours la même : c'est scripté ou pas ?

1. Guillaume lance un run en partage d'écran.
2. Marc demande à voir ce qu'un agent a réellement écrit. Guillaume clique sur le nœud du planificateur : l'artefact s'ouvre, avec ce dont il découle.
3. Il clique sur un nœud fabriqué pendant le run : la spécification et le code chargé s'affichent côte à côte.
4. Guillaume libère un outil à chaud. L'agent qui en dépendait passe en attente, tout seul, sans que rien casse.
5. Il le recharge. L'agent se réactive.
6. **Climax** — Marc pose une question sur les coeffects. *La conversation devient technique, ce qui était exactement le but.*

### Sophie, responsable conformité — l'outil qui apprend quelque chose

Sophie se moque du graphe. Elle veut savoir si ça peut lire ses fiches produit.

1. Elle regarde le run distraitement, laisse la porte s'ouvrir, approuve sans lire.
2. Elle atteint le vérificateur et colle un vrai paragraphe de sa fiche produit.
3. Elle voit ses propres formulations classées, avec le règlement cité en face de chacune.
4. **Climax** — elle repère une allégation qu'elle croyait sûre, marquée « à vérifier », avec la raison. *Le produit vient de lui apprendre quelque chose sur son propre travail.*
5. Elle cherche comment aller plus loin. Une phrase sobre, sous le résultat, lui donne le contact.

## Inspiration & Anti-patterns

On emprunte les patterns d'interaction, **jamais les couleurs ni le chrome**.

| Source | Ce qu'on prend | Ce qu'on ne prend pas |
| --- | --- | --- |
| **n8n** | Le paradigme canvas-graphe : nœuds reliés par des câbles courbes, exécution visible nœud par nœud, canvas déplaçable et zoomable | Leur densité, leur chrome, leurs couleurs, et l'idée que l'utilisateur édite le graphe |
| **Linear** | La retenue, la vitesse ressentie, la finition des micro-interactions, le sentiment que tout est précis | Leur palette sombre et violette, leur densité |
| **Dust** | Le cadrage « agents, outils, sources et connexions » et la clarté produit | Leur identité visuelle |
| **Claude Desktop** | Le layout conversation à gauche, panneau vivant à droite ; la façon de montrer l'usage d'outils sans bruit | Leur chrome d'application |

**Anti-patterns, nommés pour être refusés**

- Le tableau de bord : quatre cadrans, des micro-graphiques partout, rien qui se lise. Le produit a **un** foyer.
- Le terminal en direct : du texte qui défile vite pour faire sérieux. La narration est une phrase à la fois.
- Le faux progrès : barres, pourcentages, compteurs qui montent sans cause. Chaque chiffre vient d'un événement.
- Le nœud décoratif : une étiquette de technologie sans rien derrière. C'est exactement ce contre quoi le produit se définit.
- L'écran de chargement : le produit montre le travail, pas l'attente.

## Responsive & Platform

Un seul point de rupture, à **900 px** `[ASSUMPTION]`.

**Au-dessus** — deux volets côte à côte, le volet droit occupant la majeure partie. Le graphe respire.

**En dessous** — les deux volets s'empilent : conduite en haut, panneau vivant en dessous. Le graphe défile **dans son conteneur**, jamais le corps de page, et jamais horizontalement au niveau du document. Les compteurs passent sur une ligne à quatre colonnes serrées. Les panneaux occupent toute la largeur.

**En dessous de 600 px** — le produit reste utilisable mais assume qu'il n'est pas fait pour ça : le graphe est petit, le zoom est le geste principal, et le payoff prend toute la place une fois atteint. Le parcours de Camille doit tenir sur un téléphone ; celui de Marc suppose un grand écran.

**Navigateurs** — deux dernières versions majeures de Chrome, Firefox, Safari et Edge. Aucun repli pour les navigateurs plus anciens : le produit affiche qu'il ne les gère pas plutôt que de se dégrader en silence.
