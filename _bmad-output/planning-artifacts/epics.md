---
stepsCompleted: ['step-01', 'step-02', 'step-03', 'step-04']
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-usine-2026-08-20/prd.md
  - _bmad-output/planning-artifacts/prds/prd-usine-2026-08-20/addendum.md
  - _bmad-output/planning-artifacts/prds/prd-usine-2026-08-20/spike-cordis-navigateur.md
  - _bmad-output/planning-artifacts/architecture/architecture-usine-2026-08-20/ARCHITECTURE-SPINE.md
  - docs/3-CLAUDE-DESIGN-BRIEF.md
  - docs/0-DECISIONS.md
---

# L'usine agentique — Découpage en epics

## Overview

Décomposition du PRD finalisé et de la spine d'architecture en epics et histoires implémentables. Les identifiants d'exigences sont ceux du PRD (`FR-001` … `FR-078`, `NFR-001` … `NFR-030`) et ceux de la spine (`AD-1` … `AD-34`) — jamais renumérotés, pour que la traçabilité tienne de bout en bout.

> **Révision du 2026-08-21.** Les epics 1 à 6 ont été livrés, mais le produit a pivoté : il ne fabrique plus une fonction rendue après la porte, il **sert une application vivante que les agents remplacent à chaud**. Deux epics s'ajoutent (7 et 8) et deux deviennent caducs en tout ou partie (Epic 4 entièrement, Story 6.1). Rien n'est supprimé : ce qui est caduc porte la mention et garde son identifiant.

Le brief de design (`docs/3-CLAUDE-DESIGN-BRIEF.md`) tient lieu de contrat UX : il porte les tokens, les formes, le ton et les comportements attendus. Le design fin est produit dans Claude Design, hors de ce dépôt.

## Requirements Inventory

### Functional Requirements

**F1 · Le brief et le lancement** — FR-001 champ de brief pré-rempli · FR-002 brief modifiable · FR-003 bouton unique, premier signe de vie sous 1,5 s · FR-004 relance qui défait proprement le run précédent · FR-005 sélection de scénario · FR-006 mode d'exécution affiché en permanence.

**F2 · Le moteur de composition** — FR-007 tout agent/outil est un composant Cordis · FR-008 `inject`/`provide`, activation quand les dépendances sont là · FR-009 désactivation automatique quand une dépendance part · FR-010 libération en ordre inverse, cascade · FR-011 l'agent maître spawn et cascade · FR-012 API d'introspection de la topologie · FR-013 flux d'événements typés · FR-014 échec d'activation sans faire tomber le run · FR-015 moteur intégralement dans le navigateur (vérifié).

**F3 · Le graphe vivant** — FR-016 un nœud par composant vivant, aucun décor · FR-017 apparition au fil du run · FR-018 états visibles · FR-019 arête animée quand une valeur transite · FR-020 survol : rôle, dépendances, technologie effective · FR-021 sélection : coeffects, messages, état · FR-022 disposition automatique en couches · FR-023 déplacement et zoom bornés · FR-024 défilement contenu, jamais horizontal · FR-056 casting minimum avec constructeurs en parallèle · FR-057 étiquette de technologie seulement si elle tourne · FR-062 le composant fabriqué se distingue visuellement.

**F4 · Les agents qui parlent** — FR-025 messages au fil de l'eau · FR-026 une seule ligne de narration, remplacement sans empilement · FR-027 journal complet attribué et horodaté · FR-028 messages en français.

**F5 · La porte humaine** — FR-029 arrêt explicite avant livraison · FR-030 la porte montre ce qui a été produit et l'objection · FR-031 approuver poursuit · FR-032 écarter libère et montre la rétractation · FR-033 objection du sceptique citant un artefact précis.

**F6 · Le produit livré** — FR-034 le payoff est monté comme composant vivant · FR-035 texte libre analysé par allégation · FR-036 statut autorisé / interdit / à vérifier · FR-037 source citée et identifiable · FR-038 jamais de verdict sans source · FR-039 déterminisme · FR-040 effacer et recommencer sans relancer le run · FR-041 point de contact après le premier résultat.

**F7 · Le mode LLM branché** — FR-042 interrupteur, clé, sélection d'agents · FR-043 agent branché visuellement identifiable · FR-044 clé jamais persistée ni journalisée · FR-045 compteur de tokens réels, zéro sans faire semblant · FR-046 repli déterministe sur échec.

**F8 · Compteurs** — FR-047 agents, phase, tokens, temps en direct · FR-048 compteurs adossés à l'état réel.

**F9 · Scénarios** — FR-049 un scénario est une donnée · FR-050 ajouter un scénario ne touche pas le moteur · FR-051 au moins deux scénarios livrés.

**F10 · Les artefacts** — FR-058 artefacts consultables au fil du run · FR-059 clic sur un nœud donne son artefact · FR-060 chaque artefact dit de quoi il découle · FR-061 artefacts lisibles par un non-technicien.

**F11 · La fabrication à l'exécution** — FR-052 un agent génère un composant et le charge · FR-053 spécification et code consultables côte à côte · FR-054 remplacement à chaud et retrait d'une version fautive · FR-055 mémoire de run consultable *(reportée)*.

**F12 · L'application vivante** *(ajoutée le 2026-08-21)* — FR-063 l'application sert dès qu'elle existe · FR-064 cadre isolé sans code d'agent · FR-065 toute la logique dans des composants remplaçables · FR-066 remplacement à chaud pendant que l'application sert · FR-067 retour arrière avec les enfants, sans interruption · FR-068 créneau inerte tant que le comportement n'existe pas · FR-069 l'état survit à tout remplacement · FR-070 compteur de ce que le remplacement a évité · FR-071 balisage assaini · FR-072 exécution dans un fil isolé, arrêtable · FR-073 premier écran sous 15 s.

**F13 · Sources, emport et rejeu** *(ajoutée le 2026-08-21)* — FR-074 branchement sur une source de liste blanche · FR-075 emport d'un fichier autonome · FR-076 export et rejeu d'un run depuis son flux · FR-077 un rejeu se dit · FR-078 capacité restante affichée.

### NonFunctional Requirements

NFR-001 premier signe de vie sous 1,5 s · NFR-002 fluidité jusqu'à 40 nœuds · NFR-003 verdict sous 300 ms sur 2000 caractères · NFR-004 aucun blocage du fil principal au-delà de 100 ms · NFR-005 aucune requête LLM en mode par défaut · NFR-006 aucun coût variable par visiteur · NFR-007 bundle initial sous 500 ko gzip · NFR-008 aucun secret embarqué · NFR-009 le texte soumis ne quitte jamais le navigateur en mode par défaut · NFR-010 information explicite avant le premier appel en mode LLM · NFR-011 quatre événements agrégés, sans cookie ni identifiant ni tiers · NFR-012 toute sortie du vérificateur traçable · NFR-013 origine du verdict affichée · NFR-014 journal de run consultable · NFR-015 contrastes AA · NFR-016 parcours critique au clavier · NFR-017 état jamais porté par la seule couleur · NFR-018 `prefers-reduced-motion` respecté · NFR-019 navigateurs cibles · NFR-020 TypeScript strict · NFR-021 test d'invariant fibers/nœuds · NFR-022 tests de réversibilité · NFR-023 *(amendée)* CSP servie avec `unsafe-eval` assumé, `frame-src 'self'` et rien d'autre · NFR-024 le code d'un modèle ne s'exécute jamais dans le contexte de la page hôte · NFR-025 budget par visiteur en plus du plafond global · NFR-026 bascule annoncée sur le rejeu quand la capacité manque · NFR-027 le rejeu testé comme le direct · NFR-028 journal serveur sans contenu saisi · NFR-029 tests des trois promesses du remplacement à chaud · NFR-030 premier écran sous 15 s, premier mot de raisonnement sous 5 s.

*Caduques au 2026-08-21 :* NFR-003 (plus de vérificateur), NFR-005 et NFR-006 (le mode nominal appelle un modèle et coûte), NFR-009 restreinte (le brief part, les entrées soumises à l'application restent).

### Additional Requirements

Pas de gabarit de départ : le dépôt est déjà scaffoldé via `create-vue` (Vue 3.5.41, Vite 8.2.2, TypeScript strict, pnpm, ESLint/oxlint, Prettier). `cordis@4.0.0-rc.8` est installé et vérifié.

- **AD-2** exige une règle ESLint `no-restricted-imports` qui interdit `cordis` hors de `src/runtime/`. C'est une tâche d'outillage, pas une convention orale.
- **AD-11** retient `@dagrejs/dagre` 3.1.1 (17,6 ko gzip) pour le calcul de coordonnées uniquement ; le rendu SVG reste du code du projet. `elkjs` (484 ko gzip), `@vue-flow/core` et `pinia` sont écartés.
- **AD-16** exige que la CSP stricte soit servie **et** vérifiée par un test de non-régression en navigateur réel.
- **AD-20** exige un numéro de séquence monotone attribué par le runtime sur chaque événement.
- Tests : Vitest 4.1.11 en mode navigateur avec Playwright 1.62.1, comme le spike.
- Reprise de l'existant : `src/assets/usine.css` (design system) est conservé ; `src/usine/run.ts` est abandonné comme moteur mais fournit la géométrie du graphe, le moteur de règles du vérificateur et trois scénarios déjà écrits.

### UX Design Requirements

UX-DR1 : layout application 100vh, deux volets (brief et conversation à gauche, panneau vivant à droite), la page ne défile jamais ; pas de hero, pas de sections éditoriales.
UX-DR2 : design system Memo Labs appliqué depuis `usine.css` — crème `#faf9f7`, encre `#16130f`, terracotta `#ad4c16`, Oswald, coins carrés, thème clair unique, fond peint explicitement.
UX-DR3 : un seul niveau d'accent, un seul foyer visuel (le graphe), traits 0,5-1px, aucune ombre, aucun dégradé.
UX-DR4 : nœuds rectangulaires à trait fin, label Oswald uppercase, étiquette de technologie en muted et seulement si elle tourne réellement.
UX-DR5 : apparition des nœuds en fondu avec léger décalage, jamais tous d'un coup ; arêtes courbes fines qui se dessinent.
UX-DR6 : six états de nœud lisibles sans la couleur seule — inactif, en attente de dépendance, en cours, terminé, en erreur, libéré.
UX-DR7 : narration en une seule ligne, Oswald 300, chaque message remplace le précédent, jamais de terminal dense.
UX-DR8 : compteurs meta discrets et alignés (agents, phase, tokens, temps), grands chiffres Oswald.
UX-DR9 : panneau d'artefact — ce que l'agent a écrit ; pour un composant fabriqué, spécification et code côte à côte.
UX-DR10 : porte humaine à deux boutons carrés, avec l'objet de la décision et l'objection du sceptique ; écarter montre la rétractation dans le graphe.
UX-DR11 : bloc de payoff encadré — textarea, bouton, liste de verdicts avec statut et source citée.
UX-DR12 : indicateur de mode d'exécution visible en permanence, explication d'une phrase accessible en un geste.
UX-DR13 : accessibilité — contrastes AA, parcours critique au clavier, `prefers-reduced-motion` sans perte d'information.
UX-DR14 : sur écran étroit, le graphe défile dans son conteneur ; le corps ne défile jamais horizontalement.

### FR Coverage Map

| Epic | Exigences couvertes |
| --- | --- |
| Epic 1 · Le socle : un run réel qui pousse à l'écran | FR-001 à FR-005, FR-007 à FR-028, FR-047, FR-048, FR-049, FR-050, FR-056, FR-057, NFR-001, NFR-004, NFR-020, NFR-021, NFR-022 |
| Epic 2 · L'usine fabrique ses propres pièces | FR-052 à FR-055, FR-058 à FR-062 |
| Epic 3 · La décision humaine | FR-029 à FR-033, NFR-014 |
| Epic 4 · Le produit livré | FR-034 à FR-041, NFR-003, NFR-009, NFR-012 |
| Epic 5 · Le mode LLM branché | FR-006, FR-042 à FR-046, NFR-005, NFR-008, NFR-010, NFR-013 |
| Epic 6 · Deuxième niche et mise en ligne | FR-051 *(caduque)*, NFR-002, NFR-006 *(caduque)*, NFR-007, NFR-011, NFR-015 à NFR-019, NFR-023 |
| **Epic 7 · L'application vivante** *(cycle A)* | FR-031, FR-032, FR-034, FR-063 à FR-073, FR-076 *(rejeu, sans le partage)*, FR-077, FR-078, NFR-024 à NFR-030 |
| **Epic 8 · Valeur réelle et emport** *(cycle A′)* | FR-041, FR-074, FR-075, FR-076 *(export et partage)* |

## Epic List

### Epic 1 : Le socle — un run réel qui pousse à l'écran
Un visiteur écrit un brief, clique, et regarde une vraie composition se construire : des composants apparaissent, se câblent, s'activent, parlent, et les compteurs suivent l'état réel du moteur. Rien n'est simulé et rien n'est décoratif. C'est l'epic qui rend le produit défendable ; tout le reste s'y adosse.
**Exigences couvertes :** FR-001 à FR-005, FR-007 à FR-028, FR-047 à FR-050, FR-056, FR-057, NFR-001, NFR-004, NFR-020 à NFR-022.

### Epic 2 : L'usine fabrique ses propres pièces
Le visiteur voit l'usine produire un composant qui n'existait pas, le charger à chaud, et il peut ouvrir ce que chaque agent a réellement écrit. C'est ce qui sépare une orchestration d'une usine, et l'antidote au « c'est creux ».
**Exigences couvertes :** FR-052 à FR-055, FR-058 à FR-062.

### Epic 3 : La décision humaine
Le run s'arrête et demande au visiteur de trancher, après qu'un agent sceptique a attaqué le résultat. Approuver poursuit ; écarter rétracte, et le graphe le montre.
**Exigences couvertes :** FR-029 à FR-033, NFR-014.

### Epic 4 : Le produit livré — **caduc au 2026-08-21**
Livré, puis abandonné avec le scénario qui le portait. Le vérificateur d'allégations supposait un produit connu avant le brief. Ce qu'il visait — un dernier écran impossible à préenregistrer — est repris par l'Epic 7, plus fortement : l'application n'est pas seulement inconnue d'avance, elle change pendant que le visiteur s'en sert.
**Exigences couvertes :** ~~FR-034 à FR-041, NFR-003, NFR-009, NFR-012~~ — voir Epic 7.

### Epic 5 : Le mode LLM branché
Un interrupteur, une clé, et des agents qui raisonnent réellement — pour les entretiens techniques et les niches. Le mode par défaut reste intact, et l'échec retombe proprement sur le déterministe.
**Exigences couvertes :** FR-006, FR-042 à FR-046, NFR-005, NFR-008, NFR-010, NFR-013.

### Epic 7 : L'application vivante *(cycle A)*
Le produit cesse d'arriver à la fin. Une application apparaît en quelques secondes, le visiteur s'en sert, et les agents la remplacent à chaud sous ses doigts sans qu'il perde rien. C'est l'epic qui répond au reproche « c'est joli mais ça ne produit rien », et la seule qui démontre ce que le paradigme apporte.
**Exigences couvertes :** FR-031, FR-032, FR-034, FR-063 à FR-073, FR-076 (rejeu), FR-077, FR-078, NFR-024 à NFR-030. **Décisions :** AD-27 à AD-33.

### Epic 8 : Valeur réelle et emport *(cycle A′)*
L'application cesse de ne triturer que le texte tapé par le visiteur : elle se branche sur des données réelles. Et le visiteur repart avec — le fichier, et le lien qui rejoue son run.
**Exigences couvertes :** FR-041, FR-074, FR-075, FR-076 (export et partage). **Décisions :** AD-34, AD-33.

### Epic 10 : Le backend compagnon
Un service FastAPI qui porte tout ce qu'un onglet ne peut pas porter : la persistance des runs, la mémoire, l'exécution d'outil en bac à sable, le client MCP, l'évaluation et les traces. Le run Cordis reste dans le navigateur — c'est lui qu'on vient voir — et le backend est ce qui rend le reste sérieux.
**Exigences couvertes :** FR-084 à FR-090, NFR-033 à NFR-035.

### Epic 9 : Alignement sur la stack agents 2026
Le produit se lit en entretien : il faut qu'un observateur reconnaisse les couches qu'il connaît — protocole, observabilité, évaluation — sans qu'on adopte un framework d'orchestration qui déclarerait le graphe d'avance. C'est un epic de lisibilité autant que de robustesse, et il ferme la seule faiblesse technique réelle du protocole d'actions.
**Exigences couvertes :** FR-079 à FR-083, NFR-031, NFR-032.

### Epic 6 : Deuxième niche et mise en ligne
Un second scénario prouve que le moteur est retargetable, et l'application part en ligne sous CSP stricte, accessible, mesurée sans suivre personne. C'est l'epic qui rend le tout montrable publiquement et en entretien.
**Exigences couvertes :** FR-051, NFR-002, NFR-006, NFR-007, NFR-011, NFR-015 à NFR-019, NFR-023.

---

## Epic 1 : Le socle — un run réel qui pousse à l'écran

Un visiteur écrit un brief, clique, et regarde une vraie composition se construire. À la fin de cet epic, il n'y a ni porte humaine ni produit livré : il y a un run authentique, observable, et un test qui prouve que ce qui est affiché correspond à ce qui vit.

### Story 1.1 : Le noyau de composition isolé

En tant que développeur de la couche agentique,
je veux un module `runtime/` qui encapsule Cordis derrière une API stable,
afin que le reste de l'application ne dépende jamais du moteur et que le paradigme ne s'érode pas composant par composant.

**Acceptance Criteria:**

**Given** un projet où `cordis` est installé
**When** un fichier hors de `src/runtime/` tente d'importer `cordis`
**Then** ESLint échoue avec `no-restricted-imports`
**And** la règle est dans la configuration versionnée, pas dans une note.

**Given** le module `runtime/`
**When** on inspecte son API publique
**Then** elle expose le type `Composant` (`name`, `inject`, `provide`, `apply`, `presentation`), le type nominal `IdComposant`, l'union `RunEvent`, une fonction de chargement, une fonction de libération et une fonction d'introspection
**And** aucun type de `cordis` ne fuit dans ces signatures.

**Given** un run en cours
**When** on appelle l'introspection
**Then** elle rend la liste des composants vivants, leur état de cycle de vie et leurs arêtes de dépendance, à l'instant de l'appel.

**Given** deux événements émis à la suite
**When** on lit leur numéro de séquence
**Then** il est strictement croissant et attribué par `runtime/`, jamais par l'appelant.

### Story 1.2 : Le store et les états dérivés

En tant que développeur d'interface,
je veux un store en lecture seule alimenté par un réducteur pur,
afin qu'il n'existe qu'une seule voie d'écriture et que l'état affiché d'un nœud soit calculé au même endroit pour tous.

**Acceptance Criteria:**

**Given** le module `etat/`
**When** un composant Vue tente de muter l'état
**Then** c'est impossible : l'état exposé est en lecture seule et la seule écriture est le réducteur `(etat, RunEvent) => etat`.

**Given** une séquence d'événements rejouée deux fois
**When** on compare les états finaux
**Then** ils sont identiques : le réducteur est pur, sans horloge ni aléatoire.

**Given** un composant dont le `FiberState` est actif et qui a émis `travail-termine`
**When** on demande son état affiché
**Then** la fonction unique de dérivation rend « terminé »
**And** aucun composant ne peut pousser un état d'affichage directement.

**Given** les six états visibles
**When** on les énumère
**Then** ce sont exactement : inactif, en attente de dépendance, en cours, terminé, en erreur, libéré.

### Story 1.3 : Le scénario comme donnée et le casting du run

En tant que visiteur,
je veux qu'un run mette en scène un ensemble cohérent d'agents et d'outils,
afin de voir une vraie chaîne de production plutôt que trois boîtes génériques.

**Acceptance Criteria:**

**Given** le répertoire `scenarios/`
**When** on inspecte un scénario
**Then** c'est une donnée pure : brief par défaut, composants à charger avec leur clé de déclaration, noms de coeffects et leur propriétaire, produit livré
**And** il n'importe ni `ui/` ni `runtime/`.

**Given** un scénario chargé
**When** le run démarre
**Then** le casting comprend au minimum un planificateur, un architecte, deux outils, trois constructeurs qui s'exécutent en parallèle, un sceptique et un agent de livraison
**And** chaque constructeur produit un résultat vérifiable dans le runtime.

**Given** un composant sans technologie réellement exécutée
**When** on lit sa présentation
**Then** le champ technologie est vide et rien ne s'affiche.

**Given** un scénario qui déclare deux fournisseurs pour le même nom de coeffect
**When** le second se charge
**Then** le chargement échoue et devient un `RunEvent` d'erreur, jamais un remplacement silencieux.

### Story 1.4 : Le graphe qui pousse

En tant que visiteur,
je veux voir les nœuds apparaître et se relier au fil du run,
afin de comprendre en regardant ce que le système est en train de fabriquer.

**Acceptance Criteria:**

**Given** un run qui démarre
**When** un composant est chargé
**Then** un nœud apparaît en fondu avec un léger décalage, jamais tous d'un coup
**And** aucun nœud n'existe sans composant vivant correspondant.

**Given** deux composants reliés par un coeffect
**When** une valeur transite réellement de l'un à l'autre
**Then** l'arête s'anime
**And** aucune arête ne s'anime sans transit réel.

**Given** une même topologie chargée dans deux ordres d'activation différents
**When** on compare les dispositions
**Then** elles sont identiques : la disposition est calculée une fois au démarrage sur la topologie déclarée, puis les nœuds sont révélés.

**Given** un composant fabriqué à l'exécution qui apparaît
**When** son nœud se révèle
**Then** il occupe l'emplacement que le scénario lui avait réservé, et aucun nœud déjà posé ne bouge.

**Given** un graphe de quarante nœuds
**When** on l'affiche
**Then** aucun nœud n'en chevauche un autre et aucune arête ne traverse un nœud.

**Given** un utilisateur qui a activé `prefers-reduced-motion`
**When** le run se déroule
**Then** les nœuds apparaissent sans animation et le run reste entièrement compréhensible.

### Story 1.5 : Le brief et le lancement

En tant que visiteur arrivé sans contexte,
je veux un champ déjà rempli et un seul bouton,
afin de pouvoir lancer sans rien lire.

**Acceptance Criteria:**

**Given** la page fraîchement chargée
**When** le visiteur la regarde
**Then** le champ de brief contient un besoin métier plausible du scénario actif et reste modifiable.

**Given** le visiteur qui clique sur « Lancer l'usine »
**When** le run démarre
**Then** un premier signe de vie visible apparaît en moins de 1,5 seconde.

**Given** un run en cours
**When** le visiteur relance
**Then** le run précédent est entièrement libéré — plus aucune fiber vivante — avant que le nouveau démarre.

**Given** plusieurs scénarios disponibles
**When** le visiteur en sélectionne un autre
**Then** le brief et le graphe se réinitialisent sur ce scénario.

### Story 1.6 : La narration et les compteurs

En tant que visiteur,
je veux une phrase à la fois qui me dise ce qui se passe, et des compteurs qui suivent,
afin de suivre le run sans lire un terminal.

**Acceptance Criteria:**

**Given** plusieurs agents qui émettent des messages en parallèle
**When** la narration s'affiche
**Then** une seule ligne est visible, celle du message de plus haute séquence, et elle remplace la précédente sans empilement ni défilement.

**Given** un run en cours
**When** on lit les compteurs
**Then** ils affichent le nombre d'agents vivants, la phase courante, les tokens et le temps écoulé, tous adossés à l'état réel du moteur.

**Given** le mode par défaut
**When** on lit le compteur de tokens
**Then** il affiche zéro, sans animation ni incrémentation simulée.

**Given** un run terminé
**When** on ouvre le journal
**Then** tous les messages y figurent, attribués à leur agent et horodatés.

**Given** l'interface
**When** on lit les messages
**Then** ils sont en français.

### Story 1.7 : Inspecter un nœud

En tant que visiteur curieux,
je veux survoler et cliquer les nœuds,
afin de comprendre ce que chacun fait et de quoi il dépend.

**Acceptance Criteria:**

**Given** un nœud à l'écran
**When** le visiteur le survole
**Then** son rôle en une ligne, ses dépendances et sa technologie effective s'affichent.

**Given** un nœud
**When** le visiteur le sélectionne
**Then** un détail s'ouvre avec ses coeffects entrants et sortants, ses messages et son état.

**Given** le canvas
**When** le visiteur le déplace ou zoome
**Then** le zoom reste borné et le graphe ne peut pas sortir du champ.

**Given** un écran étroit
**When** le graphe dépasse
**Then** il défile dans son propre conteneur et le corps de page ne défile jamais horizontalement.

### Story 1.8 : Prouver que rien n'est simulé

En tant qu'ingénieur sceptique en entretien,
je veux pouvoir vérifier que le graphe est la topologie réelle,
afin d'être convaincu que ce n'est pas un script de timers.

**Acceptance Criteria:**

**Given** un run à n'importe quel instant
**When** le test d'invariant compare l'introspection du runtime et les nœuds projetés
**Then** les deux ensembles sont identiques, identifiant par identifiant.

**Given** un outil vivant dont un agent dépend
**When** on le libère à chaud
**Then** l'agent se désactive tout seul, sans erreur et sans état résiduel, et le graphe le montre.

**Given** ce même outil
**When** on le recharge
**Then** l'agent se réactive tout seul.

**Given** l'agent maître
**When** on le libère
**Then** tous les composants qu'il a chargés sont libérés en ordre inverse.

**Given** un composant qui échoue à l'activation
**When** le run continue
**Then** il n'y a aucune exception non capturée, le nœud porte l'état d'erreur, la narration l'annonce, et ses dépendants affichent qu'ils attendent une dépendance qui ne viendra pas.

---

## Epic 2 : L'usine fabrique ses propres pièces

À la fin de cet epic, le visiteur a vu l'usine produire un composant qui n'existait pas et peut ouvrir ce que chaque agent a réellement écrit.

### Story 2.1 : Le port Fabrique et le registre des primitives

En tant que développeur de la couche agentique,
je veux une fabrique qui compile une spécification en composant sans évaluer de code,
afin que la fabrication à l'exécution fonctionne sous une politique de sécurité stricte.

**Acceptance Criteria:**

**Given** le module `runtime/fabrique/`
**When** on inspecte son API
**Then** il expose un port `Fabrique` avec l'implémentation `parComposition` comme défaut.

**Given** une spécification nommant des primitives du registre
**When** la fabrique compile
**Then** elle rend un `Composant` conforme au contrat, sans jamais appeler `new Function` ni `eval`.

**Given** une page servie sous `Content-Security-Policy: default-src 'self'`
**When** la fabrication par composition s'exécute
**Then** elle réussit, sans erreur de politique.

**Given** une spécification nommant une primitive inconnue
**When** la fabrique compile
**Then** la compilation échoue et devient un `RunEvent` d'erreur, sans faire tomber le run.

**Given** le registre des primitives
**When** un agent tente de déclarer une primitive localement
**Then** c'est impossible : le registre est la seule source, tenu par `runtime/fabrique/`.

### Story 2.2 : Un agent fabrique un composant et le charge

En tant que visiteur,
je veux voir l'usine produire une pièce qu'elle n'avait pas,
afin de constater que c'est une usine et pas un assemblage préparé à l'avance.

**Acceptance Criteria:**

**Given** un run en cours
**When** un agent constructeur atteint sa tâche
**Then** il produit une spécification, la passe à la fabrique, et charge le composant obtenu dans le runtime.

**Given** ce composant fabriqué
**When** on l'observe
**Then** il déclare ses dépendances, ne s'active que lorsqu'elles sont fournies, et se libère comme les autres.

**Given** le graphe
**When** le composant fabriqué apparaît
**Then** son nœud se distingue visuellement d'un composant préexistant, sans recourir à la seule couleur.

**Given** le composant fabriqué
**When** on libère l'agent qui l'a produit
**Then** le composant fabriqué est libéré aussi, en cascade.

### Story 2.3 : La mémoire de run

En tant que visiteur,
je veux voir ce que l'agent maître sait et ce qui a été décidé,
afin de comprendre sur quoi les agents en aval s'appuient.

**Acceptance Criteria:**

**Given** un run qui démarre
**When** l'agent maître s'active
**Then** il constitue une mémoire de run — ce qu'il sait du secteur visé — et l'expose comme coeffect.

**Given** un agent en aval
**When** il travaille
**Then** il se réfère à la mémoire de run plutôt qu'au brief brut.

**Given** un run en cours
**When** le visiteur ouvre la mémoire
**Then** elle est lisible, en français, et montre ce qui s'y est ajouté au fil du run.

### Story 2.4 : Les artefacts produits par les agents

En tant que visiteur qui doute,
je veux ouvrir ce que chaque agent a écrit,
afin de vérifier qu'il y a de la substance derrière le nœud.

**Acceptance Criteria:**

**Given** un run complet
**When** on inventorie les artefacts
**Then** il y a au minimum un découpage en histoires utilisateur, une spécification avec critères d'acceptation, et une décision d'architecture motivée.

**Given** un nœud qui a produit un artefact
**When** le visiteur le sélectionne
**Then** l'artefact s'affiche dans son état final.

**Given** un composant qui a émis plusieurs versions d'un artefact
**When** on l'affiche
**Then** seule la dernière est conservée et affichée, indexée par l'identifiant du composant.

**Given** un artefact
**When** on le lit
**Then** il indique de quoi il découle — le brief, la mémoire de run, ou l'artefact d'un agent amont — et la chaîne remonte jusqu'au brief.

**Given** un artefact autre que la décision d'architecture
**When** un non-technicien le lit
**Then** il n'y trouve ni identifiant de code, ni nom de fichier, ni terme technique non paraphrasé.

### Story 2.5 : Spécification et code côte à côte

En tant qu'ingénieur en entretien,
je veux voir la spécification et le composant qu'elle a produit,
afin de juger si la fabrication est substantielle ou anecdotique.

**Acceptance Criteria:**

**Given** un composant fabriqué pendant le run
**When** le visiteur ouvre son détail
**Then** la spécification dont il découle et le code du composant tel qu'il a été chargé s'affichent côte à côte.

**Given** ce panneau
**When** on compare le code affiché et le composant réellement chargé
**Then** ils correspondent : le panneau montre ce qui tourne, pas une reconstitution.

### Story 2.6 : Remplacer et retirer une version fautive

En tant qu'ingénieur en entretien,
je veux voir un composant fabriqué remplacé à chaud puis retiré,
afin de constater que l'auto-modification est réversible.

**Acceptance Criteria:**

**Given** un composant fabriqué et actif
**When** une nouvelle version est chargée
**Then** elle remplace la précédente sans redémarrer le run et sans interrompre ses dépendants au-delà du cycle de réactivation.

**Given** une version fautive
**When** on la retire
**Then** l'état antérieur est restauré, sans état résiduel, et le graphe le montre.

---

## Epic 3 : La décision humaine

À la fin de cet epic, le run s'arrête et met le visiteur en position de trancher, après qu'un agent sceptique a réellement attaqué le résultat.

### Story 3.1 : L'agent sceptique

En tant que visiteur,
je veux qu'un agent attaque le travail avant qu'on me demande de valider,
afin que ma décision porte sur quelque chose et pas sur rien.

**Acceptance Criteria:**

**Given** un run arrivé au stade de la revue
**When** l'agent sceptique s'exécute
**Then** il produit au moins une objection qui cite un élément précis d'un artefact produit en amont.

**Given** une objection générique, non rattachée à un artefact identifiable
**When** on l'évalue
**Then** elle ne satisfait pas l'exigence : le test vérifie la présence d'une référence à un artefact.

**Given** l'objection produite
**When** la porte s'affiche
**Then** l'objection est visible avant toute décision.

### Story 3.2 : La porte humaine

En tant que visiteur,
je veux qu'on m'explique sur quoi je décide,
afin de comprendre pourquoi on m'interrompt.

**Acceptance Criteria:**

**Given** un run qui atteint la livraison
**When** il arrive à la porte
**Then** il s'arrête et attend une décision — aucun délai ne la franchit tout seul.

**Given** la porte affichée
**When** le visiteur la lit
**Then** elle montre ce qui a été produit et l'objection du sceptique.

**Given** la porte affichée
**When** le visiteur navigue au clavier
**Then** les deux boutons sont atteignables et actionnables sans souris.

### Story 3.3 : Approuver

En tant que visiteur,
je veux approuver et voir la suite,
afin d'atteindre le résultat.

**Acceptance Criteria:**

**Given** la porte en attente
**When** le visiteur approuve
**Then** le run reprend jusqu'à la livraison
**And** un `RunEvent` trace la décision et son auteur humain.

### Story 3.4 : Écarter et montrer la rétractation

En tant que visiteur,
je veux qu'écarter ait un effet visible,
afin que la porte ne soit pas un bouton décoratif.

**Acceptance Criteria:**

**Given** la porte en attente
**When** le visiteur écarte
**Then** la livraison n'a pas lieu et les composants concernés sont libérés.

**Given** cette libération
**When** on regarde le graphe
**Then** il **montre** la rétractation — les nœuds passent à l'état libéré — au lieu de se figer.

**Given** un run écarté
**When** on ouvre le journal
**Then** il consigne ce qui a été décidé et par qui, agent ou humain.

---

## Epic 4 : Le produit livré

À la fin de cet epic, le visiteur colle son propre texte et obtient un verdict juste et sourcé. C'est le moment où la démonstration cesse d'être une démonstration.

### Story 4.1 : Le moteur de règles pur

En tant que responsable conformité,
je veux un classement d'allégations reproductible,
afin de pouvoir m'y fier plutôt que de le contourner.

**Acceptance Criteria:**

**Given** le module `produits/verificateur-allegations`
**When** on inspecte son code
**Then** il n'a ni horloge, ni aléatoire, ni entrée/sortie : il prend un texte et un jeu de règles, il rend des verdicts.

**Given** un même texte soumis deux fois
**When** on compare les résultats
**Then** ils sont identiques, allégation par allégation.

**Given** un texte de 2000 caractères
**When** on le soumet
**Then** le verdict revient en moins de 300 millisecondes.

**Given** une allégation détectée
**When** on lit son statut
**Then** c'est exactement l'un de : autorisé, interdit, à vérifier.

### Story 4.2 : Pas de verdict sans source

En tant que responsable conformité,
je veux savoir sur quoi chaque verdict s'appuie,
afin de pouvoir le défendre devant un tiers.

**Acceptance Criteria:**

**Given** un verdict autorisé ou interdit
**When** on l'affiche
**Then** il est accompagné de la source qui le justifie, citée et identifiable.

**Given** une allégation qu'aucune règle ne couvre
**When** le moteur conclut
**Then** il rend « à vérifier », jamais un verdict tranché.

**Given** l'ensemble des verdicts d'une soumission
**When** on les parcourt
**Then** aucun n'est affiché sans origine : règle déterministe, ou proposition en attente de validation.

### Story 4.3 : Le payoff monté dans le graphe

En tant que visiteur,
je veux que le produit livré fasse partie de ce que j'ai vu se construire,
afin que la fin ne soit pas un encart collé à côté.

**Acceptance Criteria:**

**Given** un run approuvé
**When** la livraison s'exécute
**Then** le produit livré est monté comme un composant vivant du graphe, avec son nœud.

**Given** ce composant
**When** on libère le run
**Then** le produit livré se retire comme les autres.

### Story 4.4 : Utiliser le vérificateur

En tant que visiteuse qui teste,
je veux coller mon propre texte et recommencer autant que je veux,
afin de me convaincre que ça marche vraiment.

**Acceptance Criteria:**

**Given** le bloc de payoff affiché
**When** la visiteuse colle un texte marketing libre et valide
**Then** elle obtient une analyse par allégation, chacune avec son statut et sa source.

**Given** un résultat affiché
**When** elle efface et soumet un autre texte
**Then** un nouveau résultat s'affiche sans relancer le run.

**Given** le mode par défaut
**When** elle soumet un texte
**Then** aucune requête réseau ne part : le texte ne quitte jamais le navigateur.

**Given** le parcours critique
**When** elle navigue au clavier
**Then** elle peut lancer, approuver et utiliser le vérificateur sans souris.

### Story 4.5 : Le point de contact

En tant que professionnelle intéressée,
je veux pouvoir donner suite sans chercher,
afin de ne pas perdre le fil.

**Acceptance Criteria:**

**Given** le bloc de payoff
**When** le premier résultat s'affiche
**Then** un point de contact atteignable sans quitter la page apparaît, après le résultat et non avant.

---

## Epic 5 : Le mode LLM branché

À la fin de cet epic, un agent peut raisonner réellement sur demande, sans que le mode par défaut change de nature ni qu'un secret survive à l'onglet.

### Story 5.1 : Le port Raisonneur

En tant que développeur de la couche agentique,
je veux que les agents consomment un port plutôt qu'un fournisseur,
afin qu'aucun appel au modèle ne se disperse et que le repli soit écrit une seule fois.

**Acceptance Criteria:**

**Given** un agent
**When** on inspecte son code
**Then** il ne parle à aucun fournisseur : il consomme le coeffect `Raisonneur`.

**Given** le mode par défaut
**When** un agent raisonne
**Then** l'implémentation déterministe répond et aucune requête réseau ne part.

**Given** un agent branché sur un LLM
**When** l'appel échoue — clé invalide, quota, réseau
**Then** le port retombe sur l'implémentation déterministe, émet un `RunEvent` d'erreur, et le run continue.

### Story 5.2 : L'interrupteur et la clé

En tant qu'ingénieur en entretien,
je veux brancher un vrai modèle sur un agent choisi,
afin de montrer le raisonnement réel sans que la vitrine publique en dépende.

**Acceptance Criteria:**

**Given** l'interrupteur
**When** l'utilisateur fournit une clé et sélectionne les agents à brancher
**Then** ces agents raisonnent réellement au prochain run.

**Given** une clé fournie
**When** on inspecte `localStorage`, `sessionStorage`, les cookies et les journaux
**Then** elle n'y figure nulle part : elle vit en mémoire de module et disparaît avec l'onglet.

**Given** le mode LLM sur le point d'être activé
**When** l'utilisateur confirme
**Then** il a été informé explicitement, avant le premier appel, que son contenu part chez le fournisseur.

**Given** un agent branché
**When** on regarde son nœud et ses messages
**Then** l'état branché est visible, sans recourir à la seule couleur.

**Given** un agent qui retombe en déterministe après un échec
**When** on regarde son nœud
**Then** il cesse d'afficher qu'il est branché.

### Story 5.3 : Le compteur de tokens honnête

En tant que visiteur,
je veux que le compteur dise la vérité,
afin que rien à l'écran ne fasse semblant.

**Acceptance Criteria:**

**Given** le mode par défaut
**When** on lit le compteur de tokens
**Then** il affiche zéro, sans incrémentation simulée.

**Given** le mode LLM branché
**When** des appels réels ont lieu
**Then** le compteur affiche la consommation réelle.

### Story 5.4 : L'affichage du mode actif

En tant que visiteur,
je veux savoir ce que je regarde,
afin de ne pas croire à une promesse que le produit ne tient pas.

**Acceptance Criteria:**

**Given** n'importe quel moment
**When** le visiteur regarde l'interface
**Then** le mode d'exécution actif est affiché en permanence, sans interaction requise pour le découvrir.

**Given** cet affichage
**When** le visiteur fait un geste dessus
**Then** une explication d'une phrase de ce que le mode implique apparaît.

### Story 5.5 : La fabrication par évaluation, sous consentement

En tant qu'ingénieur en entretien,
je veux pouvoir montrer la fabrication à partir d'une spécification imprévue,
afin de démontrer le cas où le modèle produit vraiment du neuf.

**Acceptance Criteria:**

**Given** le mode par défaut
**When** on tente d'atteindre l'implémentation `parEvaluation`
**Then** c'est impossible : elle n'est accessible que depuis le mode LLM branché.

**Given** le mode LLM branché
**When** l'utilisateur choisit la fabrication par évaluation
**Then** il consent explicitement, en connaissant l'assouplissement de politique que cela suppose.

**Given** une page sous CSP stricte
**When** la fabrication par évaluation est tentée
**Then** elle échoue proprement en `RunEvent` d'erreur, et la voie par composition reste disponible.

---

## Epic 6 : Deuxième niche et mise en ligne

À la fin de cet epic, l'application est en ligne, sous CSP stricte, accessible, mesurée sans suivre personne, et un second scénario prouve que le moteur est retargetable.

### Story 6.1 : Le second scénario

**Caduque au 2026-08-21.** *La notion de scénario a été retirée le 2026-08-20 : un run défini en données est un graphe connu d'avance. La retargetabilité n'est plus à prouver, elle est acquise — rien n'étant déclaré, il n'y a rien à retargeter. La preuve équivalente, plus forte, est dans l'Epic 7 : deux briefs inventés sur place produisent deux applications différentes.*

En tant que Guillaume,
je veux pointer le même moteur sur un autre secteur,
afin de prouver que ce n'est pas un one-shot.

**Acceptance Criteria:**

**Given** les trois scénarios déjà écrits dans `src/usine/run.ts`
**When** on en porte un second au format donnée
**Then** aucun fichier du moteur n'est modifié.

**Given** ce second scénario
**When** le visiteur le sélectionne et lance
**Then** un run complet se déroule, avec son propre casting, sa source de vérité et son produit livré.

### Story 6.2 : La télémétrie fermée

En tant que Guillaume,
je veux savoir si les gens vont au bout,
afin de piloter sans suivre personne.

**Acceptance Criteria:**

**Given** le module de télémétrie
**When** on inspecte son API
**Then** il expose exactement quatre fonctions sans paramètre libre : `runLance`, `porteAtteinte`, `payoffAffiche`, `verificationSoumise`.

**Given** une session complète
**When** on inspecte le trafic sortant
**Then** aucun cookie, aucun identifiant persistant, aucun tiers publicitaire, et aucun contenu saisi par l'utilisateur.

**Given** ces quatre événements
**When** on les agrège
**Then** M1, M2 et C2 du PRD sont calculables.

### Story 6.3 : Le build servi sous CSP stricte

En tant que Guillaume,
je veux que la production tienne la politique que le produit revendique,
afin qu'`unsafe-eval` ne s'installe pas par commodité.

**Acceptance Criteria:**

**Given** l'image de service
**When** nginx sert la page
**Then** l'en-tête `Content-Security-Policy: default-src 'self'` est présent, sans `unsafe-eval`.

**Given** l'application servie sous cette politique
**When** un test de non-régression exécute un run complet dans un navigateur réel
**Then** le run va jusqu'au payoff sans erreur de politique.

**Given** l'image
**When** on l'inspecte
**Then** elle ne contient aucun secret et l'application fonctionne sans aucune variable d'environnement.

**Given** le bundle initial
**When** on le mesure
**Then** il est sous 500 ko gzip.

### Story 6.4 : Accessibilité et mouvement réduit

En tant que visiteur qui n'utilise pas de souris ou qui est sensible au mouvement,
je veux pouvoir suivre et agir,
afin que le produit ne m'exclue pas.

**Acceptance Criteria:**

**Given** l'ensemble des textes et des états de nœuds
**When** on mesure les contrastes
**Then** ils sont conformes au niveau AA.

**Given** n'importe quel élément qui exprime un état
**When** on le neutralise en niveaux de gris
**Then** l'état reste lisible : forme ou texte en plus de la couleur.

**Given** `prefers-reduced-motion` activé
**When** un run complet se déroule
**Then** aucune animation ne se joue et aucune information n'est perdue.

**Given** les navigateurs cibles
**When** on exécute le parcours critique sur les deux dernières versions majeures de Chrome, Firefox, Safari et Edge
**Then** il fonctionne sur chacune.

### Story 6.5 : La mise en ligne

En tant que Guillaume,
je veux une adresse à donner en entretien,
afin que le projet serve l'objectif numéro un.

**Acceptance Criteria:**

**Given** le build statique
**When** il est déployé
**Then** `usine.memolabs.dev` sert l'application.

**Given** le hub Memo Labs
**When** on l'ouvre
**Then** l'usine y figure via `lab-hub/public/projects.json`.

**Given** un visiteur qui arrive sans contexte
**When** il lance un run et va au bout
**Then** il n'a eu besoin d'aucune clé, aucun compte, aucune documentation.

---

## Epic 7 : L'application vivante *(cycle A)*

À la fin de cet epic, un visiteur écrit un brief, voit une application apparaître en moins de quinze secondes, s'en sert, et la voit se refaire sous ses doigts sans rien perdre. C'est l'epic qui déplace le produit de « regarder un graphe pousser » à « utiliser quelque chose qui n'existait pas ».

L'ordre des histoires n'est pas indifférent : 7.1 à 7.3 posent les trois frontières (le cadre, le fil isolé, l'état hors du remplaçable) ; 7.4 à 7.7 font vivre l'application ; 7.8 à 7.12 la rendent tenable devant un public.

### Story 7.1 : Le cadre isolé et son pont

En tant que visiteur,
je veux que l'application produite s'affiche dans la page,
afin de m'en servir sans quitter ce que je regarde.

**Acceptance Criteria:**

**Given** une page de cadre servie par nous, sablée et d'origine opaque
**When** elle est montée dans la page hôte
**Then** elle ne peut atteindre ni le document, ni le stockage, ni les variables de la page hôte, et un test le vérifie.

**Given** un balisage portant `data-invoke`, `data-field` et `data-output`
**When** le pont le reçoit
**Then** il câble les commandes aux comportements nommés, transmet les saisies désignées et affiche les réponses dans les créneaux prévus, sans qu'aucun code d'agent s'exécute dans le cadre.

**Given** la politique de sécurité servie en production
**When** on la lit
**Then** `frame-src` vaut `'self'` et rien d'autre n'a été assoupli — un test de contrat sur le fichier nginx le tient.

**Given** le pont
**When** il rend un créneau
**Then** il porte lui-même les rôles et libellés accessibles : l'accessibilité ne dépend pas de ce que le modèle a écrit (NFR-016).

### Story 7.2 : Un agent écrit l'écran

En tant qu'agent,
je veux poser le balisage de l'application,
afin que ce que j'ai fabriqué soit manipulable.

**Acceptance Criteria:**

**Given** le vocabulaire d'actions
**When** un agent émet une action d'écran
**Then** le balisage est assaini avant tout affichage : liste blanche de balises, aucun élément de script, aucun attribut d'événement, aucune source externe — et ce qui est retiré est dit à l'agent en observation.

**Given** un écran déjà monté
**When** un agent en pose un nouveau
**Then** il remplace le précédent sans que l'état du visiteur soit perdu.

**Given** un balisage refusé par l'assainissement
**When** l'agent le reçoit en retour
**Then** le refus est visible à l'écran et l'agent peut réessayer au tour suivant.

### Story 7.3 : Le fil isolé

En tant qu'auteur du produit,
je veux que le code écrit par un modèle s'exécute hors du fil de la page,
afin qu'il ne puisse ni lire ce qu'il ne doit pas, ni geler l'onglet.

**Acceptance Criteria:**

**Given** un comportement écrit pendant le run
**When** il s'exécute
**Then** il n'a accès ni au document, ni au stockage local, ni au réseau, et un test le vérifie en tentant les trois.

**Given** un comportement qui boucle sans fin
**When** son temps imparti est dépassé
**Then** il est arrêté, son créneau affiche l'incident, et le reste de l'application continue de servir.

**Given** un comportement qui lève
**When** il est appelé
**Then** l'erreur est un événement du run, pas une exception qui traverse la frontière (AD-15).

### Story 7.4 : L'application sert avant la porte

En tant que visiteur,
je veux me servir de l'application dès qu'elle existe,
afin de ne pas attendre la fin d'un run pour voir si ça marche.

**Acceptance Criteria:**

**Given** un écran et au moins un comportement publiés
**When** ils existent
**Then** l'application est servie et accepte des entrées, sans qu'aucune décision humaine ait été prise.

**Given** un créneau dont le comportement n'existe pas encore
**When** le visiteur le regarde
**Then** il est visiblement inerte et annoncé comme en construction.

**Given** ce même créneau
**When** un agent publie le comportement attendu
**Then** il s'allume sans que la page soit rechargée ; et il s'éteint si le composant disparaît.

### Story 7.5 : La session qui survit

En tant que visiteur,
je veux que ce que j'ai déjà fait reste là,
afin qu'améliorer l'application ne me coûte rien.

**Acceptance Criteria:**

**Given** une suite d'interactions du visiteur
**When** elles ont lieu
**Then** chacune est journalisée avec son entrée, sa sortie et la version du comportement qui a répondu.

**Given** ce journal
**When** un comportement est remplacé, un écran reposé, ou un composant relâché
**Then** rien n'en est perdu — l'état vit hors du cadre et hors de tout composant remplaçable.

**Given** un comportement qui tenterait de garder un état entre deux appels
**When** il est remplacé
**Then** cet état est perdu, et c'est assumé : ce qui doit survivre est passé et rendu, jamais accumulé dans le remplaçable.

### Story 7.6 : Remplacer un comportement pendant qu'il sert

En tant qu'agent,
je veux améliorer un comportement vivant,
afin que l'application devienne meilleure sous les yeux du visiteur.

**Acceptance Criteria:**

**Given** un comportement actif et une action de remplacement
**When** un agent l'émet
**Then** la nouvelle version prend la main, le cadre n'est pas rechargé, et l'appel suivant du visiteur atteint la nouvelle version.

**Given** une version fautive — qui ne compile pas, ou qui tombe en erreur à l'activation
**When** elle est chargée
**Then** elle est relâchée, la précédente est restaurée **avec les composants qu'elle avait chargés**, l'application n'a pas cessé de servir, et le refus est dit à l'écran comme à l'agent.

**Given** deux remplacements simultanés sur la même entrée
**When** ils arrivent
**Then** le second est refusé plutôt qu'entrelacé.

**Given** un agent qui tente de remplacer un composant qu'il n'a pas chargé
**When** il l'émet
**Then** c'est refusé — un composant ne défait que ce qu'il a fait (AD-26).

### Story 7.7 : Le compteur de ce qui a été évité

En tant que visiteur,
je veux voir ce que le remplacement à chaud m'a épargné,
afin de comprendre pourquoi c'est différent d'un rechargement.

**Acceptance Criteria:**

**Given** un run ayant connu au moins un remplacement
**When** le visiteur regarde l'application
**Then** une ligne indique le nombre de remplacements, le nombre de redémarrages et le nombre d'interactions conservées.

**Given** ces chiffres
**When** on les compare à l'état réel du runtime
**Then** ils en dérivent — aucun n'est estimé, aucun n'est décoratif (contre-métrique C6).

**Given** une réponse affichée par l'application
**When** le visiteur l'inspecte
**Then** elle indique quelle version de quel comportement l'a produite, et ce code est consultable.

### Story 7.8 : Le chemin court vers le premier écran

En tant que visiteur,
je veux voir quelque chose d'utilisable très vite,
afin de ne pas partir avant que le produit existe.

**Acceptance Criteria:**

**Given** un brief soumis
**When** le run démarre
**Then** le premier mot de raisonnement s'affiche en moins de 5 s, et le premier écran utilisable en moins de 15 s.

**Given** l'attente entre les deux
**When** le visiteur la subit
**Then** elle est occupée par le raisonnement réel du maître, affiché à mesure qu'il arrive — jamais par un squelette, une barre de progression ou un compte à rebours.

**Given** le premier tour du maître
**When** il s'exécute
**Then** il ne délibère pas : il pose l'écran ou crée l'agent qui le pose. La délibération vient après.

**Given** une application encore incomplète après le premier écran
**When** un agent joue son tour
**Then** il reçoit en observation ce qui manque, pour pouvoir le combler au tour suivant.

### Story 7.9 : La capacité, par visiteur et affichée

En tant qu'exploitant,
je veux qu'un seul visiteur ne puisse pas épuiser la journée,
afin que le site tienne debout en public.

**Acceptance Criteria:**

**Given** le relais
**When** un visiteur lance des runs
**Then** un budget par visiteur s'applique en plus du plafond global, sans cookie ni identifiant persistant (NFR-011).

**Given** la capacité restante
**When** le visiteur arrive sur la page
**Then** elle est affichée honnêtement, avant qu'il lance.

**Given** un budget épuisé
**When** le visiteur tente un run
**Then** il se voit proposer le rejeu, jamais une erreur brute.

### Story 7.10 : Le rejeu, chemin de premier rang

En tant que visiteur arrivé après la capacité du jour,
je veux voir un run réel quand même,
afin que la page ait un intérêt.

**Acceptance Criteria:**

**Given** un run réel enregistré sous forme de flux d'événements
**When** il est rejoué
**Then** il reproduit exactement le même modèle de lecture, sans modèle et sans réseau.

**Given** un rejeu en cours
**When** le visiteur le regarde
**Then** il est annoncé comme un rejeu, à tout instant, et jamais présenté comme un direct.

**Given** le code qui affiche un run
**When** on le lit
**Then** rien n'y distingue le direct du rejeu au-delà de l'origine des événements — mêmes vues, même réducteur, mêmes tests.

**Given** un relais muet, un crédit à zéro ou un fournisseur en panne
**When** le visiteur lance
**Then** la page bascule sur le rejeu en le disant.

### Story 7.11 : La porte statue sur ce qui sert

En tant que visiteur,
je veux décider du sort d'une application dont je me sers déjà,
afin que la décision porte sur du réel.

**Acceptance Criteria:**

**Given** une application en service et un run stabilisé
**When** la porte s'ouvre
**Then** elle montre ce qui existe — écran, comportements, versions, interactions — et non un résumé de ce qui a été tenté.

**Given** les deux gestes
**When** le visiteur les lit
**Then** ce que chacun coûte est écrit à côté du bouton : emporter valide et rend le produit emportable, écarter défait ce dont il se sert.

**Given** un écartement
**When** il est décidé
**Then** les composants sont relâchés et le graphe **montre** la rétractation plutôt que de se figer.

### Story 7.12 : La progression de l'écran

En tant que visiteur,
je veux une page qui se remplit à mesure qu'il se passe quelque chose,
afin de ne jamais regarder un décor en attente.

**Acceptance Criteria:**

**Given** la page au repos
**When** elle s'ouvre
**Then** elle ne montre que le champ de brief, vide, et trois exemples qui **écrivent dans le champ** sans lancer.

**Given** un élément d'interface quelconque
**When** il apparaît
**Then** il est payé par un événement réel du run — aucun squelette, aucune barre de progression, aucun cadre de graphe vide en attente.

**Given** un run vivant
**When** le graphe apparaît
**Then** il n'arrive qu'après l'application, réduit à une ligne de résumé qui se déplie ; l'application reste le foyer visuel.

**Given** un écran étroit
**When** le visiteur y regarde un run
**Then** une seule colonne, l'application d'abord, le graphe replié, le journal dépliable — et le corps ne défile jamais horizontalement.

**Given** chacun des états d'échec — relais muet, capacité épuisée, crédit à zéro, modèle illisible, aucune application produite, comportement arrêté
**When** il survient
**Then** il a son écran, dit ce qui s'est passé et propose la suite.

---

## Epic 8 : Valeur réelle et emport *(cycle A′)*

À la fin de cet epic, l'application produite peut montrer autre chose que le texte que le visiteur a tapé, et le visiteur repart avec quelque chose.

### Story 8.1 : La route sortante sur liste blanche

En tant qu'exploitant,
je veux que rien ne sorte du navigateur sans passer par une liste tenue côté serveur,
afin qu'un site public ne devienne pas un proxy ouvert.

**Acceptance Criteria:**

**Given** une source nommée par un agent
**When** elle est appelée
**Then** elle est résolue dans une liste blanche côté serveur — jamais construite à partir d'une adresse fournie par le modèle.

**Given** un nom hors liste
**When** un agent l'emploie
**Then** c'est refusé, dit à l'agent, et visible à l'écran.

**Given** la route sortante
**When** elle est sollicitée
**Then** les quotas du relais s'y appliquent comme à la route de raisonnement.

### Story 8.2 : Brancher un comportement sur une source

En tant qu'agent,
je veux alimenter un comportement avec des données réelles,
afin que l'application serve à quelque chose.

**Acceptance Criteria:**

**Given** l'action de branchement
**When** un agent l'émet
**Then** le comportement reçoit les données de la source à l'exécution, dans le fil isolé, sans jamais tenir d'adresse.

**Given** une réponse affichée qui vient d'une source
**When** le visiteur la lit
**Then** l'origine est indiquée (NFR-013).

**Given** une source indisponible
**When** le comportement est appelé
**Then** le créneau le dit et le reste de l'application continue de servir.

### Story 8.3 : Emporter l'application

En tant que visiteur,
je veux repartir avec ce qui a été fabriqué,
afin que la démonstration me laisse quelque chose.

**Acceptance Criteria:**

**Given** une application validée à la porte
**When** le visiteur l'emporte
**Then** il obtient un fichier autonome portant l'écran, les comportements et le pont.

**Given** ce fichier
**When** il est ouvert hors ligne, hors du site
**Then** il fonctionne.

**Given** ce fichier
**When** il s'exécute chez son destinataire
**Then** les comportements y restent isolés du document hôte, comme dans le produit (NFR-024).

### Story 8.4 : Exporter et partager un run

En tant que Guillaume,
je veux rejouer un run précis à la demande,
afin de le montrer en entretien sans dépendre d'un modèle disponible.

**Acceptance Criteria:**

**Given** un run terminé
**When** il est exporté
**Then** son flux d'événements suffit à le rejouer à l'identique — aucun événement ne référence un objet vivant, aucun ne porte de date absolue.

**Given** un run exporté
**When** il est partagé par lien et ouvert par un tiers
**Then** il se rejoue, s'annonce comme un rejeu, et le code qu'il contient s'exécute isolé (NFR-024).

**Given** le format d'archive
**When** il évolue
**Then** il porte une version de schéma, et un run d'une version antérieure est soit rejouable, soit refusé clairement.

### Story 8.5 : La sortie d'un run réussi

En tant que visiteur convaincu,
je veux savoir quoi faire ensuite,
afin que la pièce phare de Memo Labs ne finisse pas sur une adresse e-mail.

**Acceptance Criteria:**

**Given** un run emporté
**When** le visiteur arrive à la fin
**Then** il lui est proposé au minimum le fichier et le lien de rejeu de son run.

**Given** cette sortie
**When** elle est conçue
**Then** la forme de la mise en relation est tranchée (Q11) plutôt que laissée au défaut hérité.

---

## Epic 9 : Alignement sur la stack agents 2026

Déclenché par la lecture de deux cartes de la stack le 2026-08-21 — *The AI Agents Stack (2026 Edition)* d'O'Reilly Radar et *The AI Agents Stack* de Letta (nov. 2024) — et par un grief de Guillaume qui est juste : le produit sert de vitrine en entretien, et il n'emprunte rien au vocabulaire que l'interlocuteur reconnaîtra.

Les deux cartes ne disent pas la même chose, et l'écart est instructif : celle de Letta ne mentionne pas MCP, qui n'existait pas encore, et ne liste ni évaluation ni observabilité ; celle de 2026 les met au centre. Ce qu'elles partagent, en revanche, tranche la question du framework. Letta nomme ce qui rend un agent difficile : **« state management and tool execution »** — et ajoute qu'un service qui exécute des outils arbitraires **doit passer par un bac à sable**. Ce sont exactement les deux pièces que le cycle A a construites : la session qui survit au remplacement, et le fil isolé. Le produit est donc fort là où les deux articles disent que c'est dur, et muet là où ils disent que c'est standard.

L'arbitrage est posé une fois pour toutes : **on n'adopte pas de framework d'orchestration.** L'article le dit lui-même — *« Most teams pick too much framework. If your agent calls a model and a few tools, you don't need LangGraph »* — et un graphe compilé d'avance est précisément ce que ce produit refuse. En revanche, trois couches de la stack sont de vrais standards, coûtent peu, et manquent : le protocole (*« MCP won »*), l'observabilité, et l'évaluation — cette dernière étant la plus différenciante, l'article mesurant **89 % d'observabilité contre 52 % d'evals** chez les équipes en production.

### Story 9.1 : Le vocabulaire d'actions devient un schéma d'outils standard

En tant qu'auteur du produit,
je veux que les actions d'un agent soient des appels d'outils au schéma commun,
afin de ne plus perdre des tours sur du JSON mal formé — et d'être interopérable avec l'écosystème d'outils au lieu de parler une langue à moi.

*Letta : « Agents all call tools via a JSON schema defined by OpenAI — this means that agents and tools can actually be compatible across different frameworks. » Notre vocabulaire — `create`, `ask`, `build`, `replace`, `screen`, `publish`, `remove`, `done` — est le même genre d'objet, exprimé dans une langue privée. Le traduire dans le schéma commun ne change pas ce que fait un agent ; ça change qui peut lui parler.*

**Acceptance Criteria:**

**Given** un tour d'agent
**When** le relais appelle le fournisseur
**Then** il demande un appel d'outil conforme au schéma commun décrivant le vocabulaire d'actions, plutôt qu'un texte libre à découper.

**Given** ce schéma
**When** on le lit
**Then** il est la seule définition du vocabulaire : la validation côté client en découle au lieu de le redéfinir une seconde fois à la main.

**Given** un fournisseur qui ne sait pas contraindre sa sortie
**When** on l'utilise
**Then** le découpage manuel actuel reste le repli, et le mode employé est visible dans la trace.

**Given** une réponse non conforme malgré le schéma
**When** elle arrive
**Then** elle est refusée comme aujourd'hui, dite à l'écran, et comptée — un taux de non-conformité est une mesure, pas une surprise.

### Story 9.2 : Le run laisse une trace OpenTelemetry

En tant qu'ingénieur qui regarde par-dessus l'épaule,
je veux ouvrir la trace d'un run,
afin de voir la durée et le coût de chaque tour sans lire le code.

**Acceptance Criteria:**

**Given** un run
**When** il se déroule
**Then** chaque tour d'agent, chaque appel au fournisseur et chaque remplacement à chaud produit un span, avec sa durée et ses tokens.

**Given** ces spans
**When** on les inspecte
**Then** ils portent la filiation réelle : un agent créé par un autre est un span enfant de celui qui l'a créé.

**Given** aucun collecteur configuré
**When** le run tourne
**Then** rien n'est émis et rien ne casse — l'export est un réglage de déploiement, pas une dépendance.

### Story 9.3 : Un harnais d'évaluation sur des runs enregistrés

En tant que Guillaume,
je veux mesurer si l'usine s'améliore ou se dégrade,
afin de ne pas juger sur l'impression du dernier run que j'ai regardé.

**Acceptance Criteria:**

**Given** un jeu de briefs enregistrés
**When** on lance l'évaluation
**Then** elle rapporte, sur l'ensemble : la part de runs produisant une application utilisable, la part comportant au moins un remplacement à chaud réussi (M7), le délai jusqu'au premier écran, et le coût moyen.

**Given** un changement de prompt ou de budget
**When** l'évaluation est relancée
**Then** l'écart avec la mesure précédente est lisible — c'est le seul usage qui justifie l'existence du harnais.

**Given** l'évaluation
**When** elle tourne
**Then** elle n'exige ni fournisseur ni réseau sur les runs déjà enregistrés.

### Story 9.4 : Où l'usine se place dans la stack

En tant que visiteur technique,
je veux voir en une page ce que l'usine emprunte à la stack et ce qu'elle fait autrement,
afin de juger un choix plutôt qu'une ignorance.

**Acceptance Criteria:**

**Given** la page
**When** on la lit
**Then** elle nomme les six couches de la stack 2026 et dit, pour chacune, ce que l'usine utilise, ce qu'elle a écrit elle-même, et pourquoi.

**Given** la couche « frameworks »
**When** on la lit
**Then** elle assume l'absence de framework d'orchestration et en donne la raison — un graphe compilé d'avance est incompatible avec la promesse — plutôt que de la passer sous silence.

**Given** la couche « guardrails », que l'article donne pour la moins mûre
**When** on la lit
**Then** elle montre ce que l'usine y apporte : porte humaine, budgets, fil isolé, retour arrière garanti.

**Given** la couche « exécution d'outil », que Letta dit devoir passer par un bac à sable (Modal, E2B)
**When** on la lit
**Then** elle nomme le fil isolé comme ce bac à sable, dit pourquoi c'est un Worker et non E2B — le produit s'exécute chez le visiteur — et donne le modèle de menace : pas de DOM, pas de stockage, pas de réseau, arrêt possible.

**Given** la couche « agent hosting », que Letta place au sommet
**When** on la lit
**Then** elle assume ce que l'usine ne fait pas : les agents ne survivent pas à l'onglet, il n'y a ni persistance, ni API REST d'agents, ni multi-locataire. C'est une démonstration côté client, pas un service d'agents hébergé, et le dire vaut mieux que le laisser découvrir.

---

## Epic 10 : Le backend compagnon

Décidé le 2026-08-21. La contrainte « client-only » du PRD d'origine est levée — elle était déjà morte depuis que le relais existe.

Le partage est tranché par une contrainte dure plutôt que par un goût : **Cordis n'existe qu'en TypeScript**, donc un service Python ne peut pas héberger le run. C'est ce qui rend ce découpage cohérent au lieu de bancal — le différenciateur reste là où il se voit, dans l'onglet du visiteur, et la stack conventionnelle est portée par le service qui peut la porter.

Ce que le backend gagne, dans l'ordre où ça sert : la persistance (un run partageable, rejouable, mesurable), puis la mémoire, puis les outils, puis l'évaluation.

### Story 10.1 : Le relais devient un service FastAPI, à contrat identique

En tant qu'auteur du produit,
je veux un seul service backend au lieu d'un relais Node isolé,
afin que tout ce qui suit ait un endroit où vivre.

**Acceptance Criteria:**

**Given** le client existant
**When** le relais Node est remplacé par le service FastAPI
**Then** `/api/health` et `/api/reason` gardent exactement la même forme de requête et de réponse — le client n'est pas modifié, et c'est la preuve que la migration est propre.

**Given** les bornes actuelles
**When** on les porte
**Then** elles sont toutes reprises : taille de corps, d'instruction, de contexte, de sortie, par minute, par visiteur et par jour, avec la capacité restante annoncée par `/health`.

**Given** la clé du fournisseur
**When** le service tourne
**Then** elle vient de l'environnement et n'apparaît ni dans une réponse, ni dans un journal, ni dans une trace.

**Given** le service
**When** on le teste
**Then** ses tests couvrent les mêmes cas que ceux du relais Node — refus de rôle inconnu, corps trop gros, quota, réponse coupée — et ils tournent dans la même commande que le reste.

### Story 10.2 : Les runs sont persistés et rejouables par lien

En tant que Guillaume,
je veux qu'un run survive à l'onglet,
afin de pouvoir le rejouer en entretien sans dépendre d'un modèle disponible.

**Acceptance Criteria:**

**Given** un run terminé
**When** le client le pousse au backend
**Then** son flux d'événements est stocké tel quel, avec la version de schéma, et rendu par un identifiant.

**Given** cet identifiant
**When** un tiers ouvre le lien
**Then** le run se rejoue à l'identique, s'annonce comme un rejeu, et n'exige ni modèle ni clé.

**Given** un run stocké
**When** il contient du code écrit par un modèle
**Then** ce code s'exécute chez le visiteur dans le fil isolé, comme dans un run vivant — le partage n'est pas un chemin d'exécution privilégié.

### Story 10.3 : Trois conteneurs, décrits dans le dépôt

En tant qu'exploitant,
je veux que la topologie vive dans un fichier du dépôt,
afin qu'elle se rejoue ailleurs que dans la base d'un orchestrateur.

**Acceptance Criteria:**

**Given** le déploiement
**When** on le lit
**Then** un `compose.yaml` du dépôt décrit les trois services — site, api, base — avec les labels du reverse proxy.

**Given** ce fichier
**When** on le lance
**Then** il fonctionne aussi bien sous l'orchestrateur actuel qu'en `docker compose` nu : c'est l'invariant qui rend le changement d'orchestrateur réversible.

**Given** la base
**When** le service démarre
**Then** le schéma est appliqué par une migration versionnée, jamais à la main.

### Story 10.4 : La mémoire du run, adossée à la base

En tant qu'agent,
je veux retrouver ce qui a été établi plus tôt,
afin de ne pas repartir du brief brut à chaque tour.

**Acceptance Criteria:**

**Given** un run
**When** un agent publie un fait
**Then** il est stocké, attribué, et consultable par les agents suivants comme un coeffet ordinaire.

**Given** un corpus de faits
**When** un agent en cherche un
**Then** la recherche est textuelle **et** vectorielle, et la source de chaque fait est rendue avec lui.

**Given** un run relâché
**When** on regarde la base
**Then** ce qui appartenait au run est parti avec lui : la persistance ne contourne pas la réversibilité, elle la suit.

### Story 10.5 : L'exécution d'outil en bac à sable, côté serveur

En tant qu'agent,
je veux un outil qui peut réellement atteindre une source,
afin que l'application produise autre chose que du texte retravaillé.

**Acceptance Criteria:**

**Given** un outil qui demande le réseau
**When** il s'exécute
**Then** il tourne côté serveur, dans un bac à sable, jamais dans le processus du service.

**Given** ce bac à sable
**When** un outil y tourne
**Then** il a un temps, une mémoire et une liste de destinations bornés, et le dépassement l'arrête.

**Given** un outil qui n'a pas besoin du réseau
**When** il s'exécute
**Then** il reste dans le fil isolé du navigateur : déplacer côté serveur ce qui marche chez le visiteur ajouterait une latence pour rien.

### Story 10.6 : Le client MCP vit dans le backend

En tant qu'agent,
je veux découvrir l'outillage disponible à l'exécution,
afin de me câbler sur des outils que personne n'avait déclarés.

**Acceptance Criteria:**

**Given** des serveurs MCP configurés côté service
**When** un agent demande ce qui existe
**Then** il reçoit la liste des outils découverte à l'exécution, jamais une liste écrite dans le code du client.

**Given** un outil MCP
**When** un agent l'appelle
**Then** l'appel passe par le backend, sous les mêmes quotas et la même liste blanche que le reste.

**Given** le navigateur
**When** on regarde ce qu'il joint
**Then** il ne parle jamais directement à un serveur MCP.

### Story 10.7 : Le harnais d'évaluation tourne sur les runs stockés

En tant que Guillaume,
je veux mesurer l'usine sur un jeu de runs,
afin de savoir si un changement l'améliore au lieu de le croire.

**Acceptance Criteria:**

**Given** les runs stockés
**When** l'évaluation tourne
**Then** elle rapporte la part de runs produisant une application, la part avec au moins un remplacement réussi, le délai jusqu'au premier écran et le coût moyen.

**Given** deux exécutions sur le même jeu
**When** on les compare
**Then** elles donnent le même rapport.

**Given** un changement de prompt ou de budget
**When** l'évaluation est relancée
**Then** l'écart avec la mesure précédente est lisible — c'est le seul usage qui justifie le harnais.
