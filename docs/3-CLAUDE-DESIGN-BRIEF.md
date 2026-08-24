# Memo Labs — L'usine agentique · Brief de design

> **Mis à jour le 2026-08-20.** La version précédente décrivait une **page éditoriale** (barre de marque, hero avec titre géant, largeur 920px, sections espacées). **C'est périmé.** `0-DECISIONS.md` tranche : application plein écran, 100vh, qui ne scrolle pas. Tout le reste du brief — tokens, typographie, formes, comportements, ton — reste valide et contractuel.

## Ce qu'on design

Une **application plein écran** dans laquelle on regarde une usine agentique se construire elle-même, en direct, sous forme de graphe vivant, et qui se termine par un vrai produit fonctionnel utilisable dans la page.

Le cadrage : **le canvas de n8n, exécuté avec la précision de Linear, cadré comme une plateforme d'agents à la Dust, dans un layout calme à la Claude Desktop — le tout habillé du design system Memo Labs.**

## Le layout (tranché)

- **100vh, application plein écran.** La page ne scrolle jamais. Pas de hero, pas de sections éditoriales, pas de pied de page.
- **Deux volets.** À gauche, le brief et la conversation. À droite, le panneau vivant : le graphe et les agents qui parlent.
- **Un seul foyer visuel** : le graphe. Tout le reste est sobre.
- Sur écran étroit, le graphe défile **dans son propre conteneur**. Le corps de page ne défile jamais horizontalement.

## Le design system Memo Labs (tokens exacts)

Couleurs :

- `--bg: #faf9f7` (crème chaud, fond)
- `--surface: #ffffff`
- `--ink: #16130f` (encre, quasi-noir chaud)
- `--muted: #6b6055` (gris chaud, texte secondaire)
- `--line: #e7e2da` (traits fins)
- `--accent: #ad4c16` (terracotta / rouille) — l'accent principal
- `--accent-soft: #e58a4a` (orange plus doux)
- `--grid: #16130f0b` (grille de fond très faible)

Typographie :

- **Oswald** partout (condensé), via Google Fonts. Titres en **uppercase**, poids 600-700, letter-spacing serré négatif.
- Labels et eyebrows : Oswald, uppercase, letter-spacing large (~0.2em), en terracotta.
- Corps : Oswald 300-400.

Formes :

- **Coins carrés** (border-radius 0).
- Traits 0,5-1px. **Aucune ombre, aucun dégradé.** Grille de fond très subtile.
- **Un seul niveau d'accent** (terracotta), pas d'arc-en-ciel.
- Thème clair unique, fond peint explicitement.

## Le ton (contractuel)

**Éditorial, aéré, confiant, précis. Comme un studio qui montre une machine impressionnante sans esbroufe.**

Le wahou vient du graphe qui pousse, de la largeur des technologies mobilisées et du payoff réel — **jamais d'effets décoratifs**. Toute animation exprime un événement réel du moteur. Une interface qui ferait joli sans rien dire du système échoue à cette exigence, même si elle est belle.

## Les zones à designer

1. **Barre de marque, minimale** : carré terracotta + « MEMO LABS », et un label discret « LAB · usine agentique ». Elle occupe une bande fine, pas un en-tête de page.
2. **Le volet gauche — brief et conversation** : le champ de brief (pré-rempli, modifiable), le bouton « ▶ LANCER L'USINE » (noir, hover terracotta), puis le fil des messages d'agents au fil du run.
3. **Les compteurs meta**, discrets et alignés : Agents · Phase · Tokens · Temps. Grands chiffres Oswald. Ils affichent l'état réel du moteur — en mode par défaut, le compteur de tokens affiche zéro sans faire semblant.
4. **Le graphe live** (la pièce centrale) :
   - **nœuds** = agents et outils, rectangles carrés à trait fin, label uppercase Oswald ; une étiquette de technologie en muted **uniquement si cette technologie tourne réellement derrière le nœud** ;
   - les nœuds **apparaissent au fil du run** (fondu + léger décalage), pas tous d'un coup ;
   - **arêtes** courbes fines qui se dessinent ; une arête s'anime quand une valeur transite réellement ;
   - **états visibles** : inactif, en attente de dépendance, en cours, terminé, en erreur, libéré. Jamais signalés par la seule couleur ;
   - un **composant fabriqué pendant le run** se distingue visuellement d'un composant préexistant ;
   - **interactions** : survol → rôle en une ligne, dépendances ; clic → détail du nœud et **l'artefact qu'il a produit** ;
   - canvas déplaçable et zoomable, zoom borné ;
   - disposition automatique en couches de gauche à droite, sans chevauchement.
5. **La narration live** : **une seule ligne**, grande, calme (Oswald 300). Chaque message remplace le précédent. Pas d'empilement, pas de défilement, pas de terminal dense.
6. **Le panneau d'artefact** : ce que l'agent a réellement écrit — découpage en histoires, spécification, décision d'architecture — et, pour un composant fabriqué, sa spécification et son code côte à côte.
7. **La porte humaine** : deux boutons carrés (Approuver / Écarter), accompagnés de ce sur quoi porte la décision et de l'objection du sceptique. Écarter doit **montrer la rétractation** dans le graphe, pas le figer.
8. **L'application vivante (le protagoniste)** — *révisé le 2026-08-24* : plus un bloc « payoff » qui apparaît à la fin, mais l'application elle-même, posée tôt dans le run et **utilisée pendant qu'il continue**. Le visiteur s'en sert ; les agents la refont à chaud **autour de ce qu'il en fait**, sans qu'il perde sa session. Elle doit **fonctionner** (code réel, sources réelles). Un compteur honnête — « N remplacements à chaud · 0 redémarrage · M interactions conservées » — dit ce que la mue lui a épargné. La conformité des allégations reste un cas d'usage exemplaire, pas la forme obligée : le produit est brief-agnostique.
9. **L'indicateur de mode** : le mode d'exécution actif (déterministe ou LLM branché) est visible en permanence, avec une explication d'une phrase accessible en un geste.

## Contraintes techniques

- Vue 3 + Vite. Thème clair unique.
- Accessibilité : contrastes AA, parcours critique au clavier (lancer, approuver, utiliser le vérificateur), état jamais porté par la seule couleur, `prefers-reduced-motion` respecté — le run reste compréhensible sans mouvement.
- Le graphe doit rester fluide jusqu'à une quarantaine de nœuds vivants.

## Références d'interaction

On garde **notre** design system ; on emprunte les **patterns**, jamais les couleurs.

- **n8n** — le canvas-graphe : nœuds reliés par des câbles courbes, exécution visible nœud par nœud, canvas déplaçable et zoomable. *Pas prendre* : leur densité et leurs couleurs.
- **Linear** — la précision minimaliste : vitesse ressentie, typographie nette, finition des micro-interactions. *Pas prendre* : leur palette sombre.
- **Dust** — la plateforme d'agents : comment on présente des agents, leurs outils, leurs sources et leurs connexions. *Pas prendre* : leur identité visuelle.
- **Claude Desktop** — le layout conversation à gauche / panneau vivant à droite, et le ton calme. *Pas prendre* : leur chrome d'app.

## Source de vérité

Les exigences détaillées vivent dans le PRD : `_bmad-output/planning-artifacts/prds/prd-usine-2026-08-20/prd.md`, sections 7 (F3, F4, F5, F6, F10) et 10.
