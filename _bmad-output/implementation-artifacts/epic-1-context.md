# Epic 1 Context: Le socle — un run réel qui pousse à l'écran

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Rendre le produit défendable. Un visiteur écrit un brief, clique, et regarde une vraie composition d'agents se construire : des composants apparaissent, se câblent par leurs dépendances déclarées, s'activent quand elles sont satisfaites, parlent, et les compteurs suivent l'état réel du moteur. Rien n'est scripté par des timers, rien n'est décoratif. À la fin de cet epic il n'y a ni porte humaine ni produit livré — il y a un run authentique, observable, et un test qui prouve que ce qui est affiché correspond exactement à ce qui vit dans le runtime. Tous les epics suivants s'y adossent.

## Stories

- Story 1.1 : Le noyau de composition isolé
- Story 1.2 : Le store et les états dérivés
- Story 1.3 : Le scénario comme donnée et le casting du run
- Story 1.4 : Le graphe qui pousse
- Story 1.5 : Le brief et le lancement
- Story 1.6 : La narration et les compteurs
- Story 1.7 : Inspecter un nœud
- Story 1.8 : Prouver que rien n'est simulé

## Requirements & Constraints

Le moteur tourne intégralement dans le navigateur, sans worker ni service distant — c'est mesuré, pas supposé. Aucune clé, aucun token, aucune requête vers un fournisseur de modèle : le run par défaut doit être gratuit et instantané pour n'importe quel visiteur.

Un composant déclare ce dont il a besoin et ce qu'il expose ; il ne s'active que lorsque tout est fourni, se désactive seul quand une dépendance disparaît, et libère ses effets en ordre inverse quand on le décharge — y compris ce qu'il a lui-même chargé. Un composant qui échoue à s'activer ne fait pas tomber le run : l'échec devient un événement, le nœud porte l'erreur, ses dépendants disent qu'ils attendent une dépendance qui ne viendra pas.

Le premier signe de vie visible doit apparaître moins d'une seconde et demie après le clic. Aucun blocage du fil principal au-delà de cent millisecondes. Le graphe reste fluide jusqu'à une quarantaine de nœuds vivants.

Le graphe affiche un nœud par composant vivant et une arête par dépendance réelle. Aucun nœud décoratif, aucune animation qui n'exprime pas un événement du moteur. Un nœud n'affiche une étiquette de technologie que si cette technologie tourne réellement derrière lui — sinon le champ reste vide.

TypeScript strict, aucun `any` implicite, aucune assertion sur une frontière de module. Deux invariants sont couverts par des tests automatisés : la correspondance exacte entre composants vivants et nœuds affichés, et le comportement de réversibilité (chargement, libération, cascade, réactivation).

## Technical Decisions

**Paradigme : noyau de composition et projection unidirectionnelle.** Le runtime est le cœur ; il ne connaît ni Vue ni le DOM. Tout ce que le reste du monde apprend de lui sort par un flux d'événements typés, réduit dans un modèle de lecture que l'interface se contente d'afficher. L'interface pose des intentions, elle ne touche jamais une fiber.

**Un seul module importe le runtime de composition**, et c'est une règle de lint, pas une discipline. Les autres modules passent par son API publique ; aucun type du runtime ne fuit dans ses signatures.

**Canal unique.** Tout arrive par une union discriminée d'événements. Ajouter une information visible au run, c'est ajouter une variante à cette union — jamais un rappel, jamais une lecture directe du registre. Chaque événement porte un numéro de séquence strictement croissant attribué par le runtime.

**Une seule voie d'écriture** dans l'état : un réducteur pur. L'état exposé est en lecture seule. Les composants d'affichage reçoivent des valeurs et émettent des intentions.

**L'état affiché d'un nœud est dérivé, jamais déclaré.** Une fonction unique traduit l'état de cycle de vie du runtime et les événements reçus en l'un des six états visibles. Le runtime ne connaît pas la notion de « terminé » : c'est le composant qui signale qu'il a fini, et seule cette fonction traduit.

**L'identité appartient au runtime.** Aucun autre module ne fabrique d'identifiant de composant.

**Un nom de dépendance a un propriétaire unique**, déclaré par le scénario. Un second fournisseur pour un nom déjà pris est une erreur de chargement, jamais un remplacement silencieux.

**Un scénario est une donnée**, pas du code : il déclare brief, composants, clés de déclaration, noms de dépendances et leur propriétaire, produit livré. Il n'importe rien du moteur ni de l'interface.

**La disposition est calculée une seule fois**, au démarrage, sur la topologie complète déclarée — emplacements réservés compris pour les composants fabriqués plus tard. Les nœuds sont ensuite révélés, jamais repositionnés. Les couches viennent de la profondeur topologique, l'ordre interne de la clé de déclaration. Le calcul de coordonnées est délégué à une petite bibliothèque ; le rendu reste du code du projet, en SVG.

**Conventions.** Identifiants et fichiers en français, sauf les noms d'API du runtime qui restent tels quels. Modules en kebab-case, composants d'affichage en PascalCase. Types d'événements en kebab-case au passé composé — un événement décrit un fait accompli. Forme d'erreur normalisée, jamais une erreur brute franchissant la frontière du runtime. Aucune sortie console en production. Aucune variable d'environnement dans le chemin par défaut : l'application doit fonctionner servie telle quelle.

## UX & Interaction Patterns

Application plein écran, cent pour cent de la hauteur, deux volets séparés d'un filet : conduite à gauche (marque, mode, brief, lancement, narration, fil des messages), panneau vivant à droite (compteurs puis graphe). **Le corps de page ne défile jamais** ; ce qui dépasse défile dans son conteneur.

Palette courte à un seul accent terracotta, qui signifie une seule chose : ça se passe maintenant. Fond crème peint explicitement, encre chaude, gris chaud pour le second plan, filets clairs. Oswald partout, titres uppercase à interlettrage négatif, eyebrows uppercase très espacés en terracotta. **Rayon zéro partout**, traits d'un pixel, aucune ombre, aucun dégradé. Un seul foyer visuel : le graphe.

Six états de nœud, chacun doublé d'un signal qui n'est pas la couleur : trait fin, trait pointillé, trait épaissi, coche, croix, label barré. Le test : en niveaux de gris, tout reste lisible.

Les nœuds sont révélés à leur place définitive en fondu avec un léger décalage, jamais tous d'un coup. Les arêtes sont des courbes fines qui se dessinent et passent en accent pendant qu'une valeur transite réellement. Le survol informe, le clic ouvre ; aucun survol ne déclenche d'action. Le canvas se déplace et se zoome, zoom borné, mais les nœuds ne sont pas déplaçables — ce n'est pas un éditeur.

La narration est **une seule ligne** de grande taille et de poids léger : chaque message remplace le précédent, sans empilement ni défilement. Le fil complet est en dessous, attribué et horodaté. Le compteur de tokens affiche zéro fixe en mode déterministe : il ne s'anime pas.

Accessibilité : contrastes AA, parcours critique entièrement au clavier, focus visible y compris sur les nœuds, graphe exposé comme un groupe nommé avec une description textuelle des composants vivants, narration annoncée poliment, et sous préférence de mouvement réduit toutes les animations disparaissent sans qu'aucune information ne soit perdue.

## Cross-Story Dependencies

Ordre strict : 1.1 fournit le contrat, les événements et l'introspection dont tout le reste dépend. 1.2 consomme les événements de 1.1. 1.3 fournit le scénario et le casting que 1.4 dispose et que 1.5 lance. 1.4 dépend de la disposition, donc de la topologie déclarée par 1.3. 1.6 et 1.7 consomment l'état produit par 1.2. 1.8 vérifie 1.1, 1.2 et 1.4 ensemble et ne peut pas être écrite avant elles.

Aucune dépendance vers un epic ultérieur. Les emplacements réservés aux composants fabriqués (epic 2) sont prévus par la disposition de 1.4 mais ne sont pas remplis dans cet epic.
