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

Décomposition du PRD finalisé et de la spine d'architecture en epics et histoires implémentables. Les identifiants d'exigences sont ceux du PRD (`FR-001` … `FR-062`, `NFR-001` … `NFR-023`) et ceux de la spine (`AD-1` … `AD-22`) — jamais renumérotés, pour que la traçabilité tienne de bout en bout.

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

**F11 · La fabrication à l'exécution** — FR-052 un agent génère un composant et le charge · FR-053 spécification et code consultables côte à côte · FR-054 remplacement à chaud et retrait d'une version fautive · FR-055 mémoire de run consultable.

### NonFunctional Requirements

NFR-001 premier signe de vie sous 1,5 s · NFR-002 fluidité jusqu'à 40 nœuds · NFR-003 verdict sous 300 ms sur 2000 caractères · NFR-004 aucun blocage du fil principal au-delà de 100 ms · NFR-005 aucune requête LLM en mode par défaut · NFR-006 aucun coût variable par visiteur · NFR-007 bundle initial sous 500 ko gzip · NFR-008 aucun secret embarqué · NFR-009 le texte soumis ne quitte jamais le navigateur en mode par défaut · NFR-010 information explicite avant le premier appel en mode LLM · NFR-011 quatre événements agrégés, sans cookie ni identifiant ni tiers · NFR-012 toute sortie du vérificateur traçable · NFR-013 origine du verdict affichée · NFR-014 journal de run consultable · NFR-015 contrastes AA · NFR-016 parcours critique au clavier · NFR-017 état jamais porté par la seule couleur · NFR-018 `prefers-reduced-motion` respecté · NFR-019 navigateurs cibles · NFR-020 TypeScript strict · NFR-021 test d'invariant fibers/nœuds · NFR-022 tests de réversibilité · NFR-023 fonctionne sous CSP stricte sans `unsafe-eval`.

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
| Epic 6 · Deuxième niche et mise en ligne | FR-051, NFR-002, NFR-006, NFR-007, NFR-011, NFR-015 à NFR-019, NFR-023 |

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

### Epic 4 : Le produit livré
Un vérificateur d'allégations apparaît en fin de run et fonctionne pour de vrai : on y colle son propre texte, on obtient un verdict par allégation, avec sa source. C'est le moment où la démonstration cesse d'être une démonstration.
**Exigences couvertes :** FR-034 à FR-041, NFR-003, NFR-009, NFR-012.

### Epic 5 : Le mode LLM branché
Un interrupteur, une clé, et des agents qui raisonnent réellement — pour les entretiens techniques et les niches. Le mode par défaut reste intact, et l'échec retombe proprement sur le déterministe.
**Exigences couvertes :** FR-006, FR-042 à FR-046, NFR-005, NFR-008, NFR-010, NFR-013.

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
