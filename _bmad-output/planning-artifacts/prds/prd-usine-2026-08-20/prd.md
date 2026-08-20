---
title: "L'usine agentique — PRD"
status: final
created: 2026-08-20
updated: 2026-08-20
---

# L'usine agentique — PRD

**Produit :** L'usine agentique (pièce « Lab » phare de Memo Labs)
**Domaine cible :** `usine.memolabs.dev`
**Auteur :** Guillaume (Memo), avec facilitation BMad
**Statut :** finalisé le 2026-08-20

> Les passages marqués `[ASSUMPTION]` sont des inférences faites à partir de `docs/` et récapitulées dans l'**Index des assumptions**, en annexe. Ils sont assumés en l'état ; les confirmer ou les corriger relève de l'architecture, pas d'un blocage du PRD.

> **Documents liés.** `addendum.md` porte la profondeur technique et les alternatives écartées. `spike-cordis-navigateur.md` porte la preuve de faisabilité du moteur. `review-rubric.md` porte la revue qualité. Les quatre fichiers `reconcile-*.md` portent la confrontation aux sources d'origine.

---

## 1. Résumé exécutif

L'usine agentique est une application web dans laquelle un visiteur écrit un brief métier en langage naturel et regarde un système agentique se construire lui-même pour y répondre : des agents et des outils apparaissent réellement, se câblent entre eux, exécutent, s'expriment, passent une porte de validation humaine, et produisent en sortie un produit fonctionnel utilisable immédiatement dans la page.

La promesse tient sur cinq affirmations non négociables :

1. **Les agents sont réels.** Chaque agent et chaque outil est un composant Cordis vivant (une fiber), pas une entrée d'un script de timers. Le graphe affiché est la projection de la topologie réelle du runtime.
2. **L'usine fabrique ses propres pièces.** Les agents ne se contentent pas d'assembler un catalogue fermé : ils **génèrent des composants à l'exécution** et les chargent à chaud. Un composant généré qui se comporte mal se retire proprement. C'est ce qui sépare une orchestration d'une usine, et c'est la raison d'être du choix de Cordis.
3. **Le produit livré est réel.** Le payoff final — un vérificateur d'allégations de type ClaimCheck — fonctionne vraiment, adossé à des règles issues du cadre réglementaire, avec citation de la source.
4. **Ça ne coûte rien à regarder.** Le mode par défaut ne consomme ni clé d'API ni tokens. Le raisonnement LLM est un interrupteur, pas un prérequis.

5. **Ça doit impressionner.** Pas par des effets décoratifs — par ce qui se passe réellement à l'écran : un système qui se construit lui-même sous les yeux du visiteur, avec la largeur de technologies qu'il mobilise, et qui finit par lui tendre un outil qui marche. Le spectacle est un objectif du produit, pas un dommage collatéral qu'on tolère.

Ce PRD couvre la v1 : un run complet, de bout en bout, sur un scénario de niche, déployé publiquement.

---

## 2. Contexte et problème

Le marché ne rémunère plus l'écriture de code : il rémunère le jugement et l'orchestration d'agents. La compétence rare est de piloter l'IA sans perdre la maîtrise — le modèle propose, l'humain et le code déterministe disposent.

Le problème que ce produit résout est double, et il faut nommer les deux honnêtement :

- **Problème externe (utilisateur).** Les plateformes d'agents montrent des workflows configurés à la main, ou des démonstrations où l'on ne voit pas ce qui se passe derrière. `[ASSUMPTION]` À notre connaissance, aucune ne montre une composition d'agents qui se construit elle-même, visible, réversible, et qui aboutit à un artefact utilisable. Cette lecture du paysage n'a pas été validée par une étude — elle repose sur l'observation directe des outils du domaine.
- **Problème interne (auteur).** Une démo léchée sur un marché saturé reste une démo. Il faut une preuve qu'un recruteur ou un client ne peut pas balayer : quelque chose qui tourne pour de vrai devant lui, en direct, sans clé d'API, et qui produit un objet dont il peut vérifier la justesse lui-même.

L'échec à éviter est précis : un joli graphe qui s'anime sans que rien ne se passe derrière. C'est le risque numéro un du produit et la contrainte qui structure toutes les décisions qui suivent.

---

## 3. Objectifs et métriques de succès

### Objectifs

- **O1.** Un visiteur qui arrive sans contexte comprend, en moins de trente secondes, ce qu'il regarde et ce qui vient d'être produit.
- **O2.** Un observateur technique peut vérifier que la composition est réelle — pas simulée — sans lire le code source.
- **O3.** Le produit livré en fin de run est réellement utilisable dans la page et donne un résultat vérifiable, sourcé.
- **O4.** Le run public complet ne consomme aucun token et aucun secret.
- **O5.** Le moteur est retargetable : pointer l'usine sur un autre secteur ne demande pas de réécrire le moteur.
- **O6.** Le run impressionne. Un visiteur qui n'a rien demandé reste jusqu'au bout parce que ce qu'il voit est spectaculaire — la construction elle-même, la largeur des technologies mobilisées, le basculement final vers un objet utilisable.

### Métriques de succès

| # | Métrique | Cible v1 |
|---|---|---|
| M1 | Part des visiteurs qui vont jusqu'au bout d'un run | ≥ 60 % `[ASSUMPTION]` |
| M2 | Part des visiteurs qui utilisent le produit livré (soumettent au moins un texte au vérificateur) | ≥ 30 % `[ASSUMPTION]` |
| M3 | Durée d'un run complet en mode par défaut | 60 à 120 s |
| M4 | Coût en tokens d'un run public | 0 |
| M5 | Nombre de scénarios de niche opérationnels sur le même moteur | ≥ 2 |
| M6 | Mentions du projet en entretien qui débouchent sur une question technique de fond plutôt qu'un « joli » poli | qualitatif et assumé comme tel : journal tenu par Guillaume, pas de seuil |

> M1, M2 et C2 sont des métriques d'entonnoir. Elles ne sont mesurables que parce que NFR-011 autorise le comptage agrégé de quatre événements. Sans cette instrumentation, ces trois lignes seraient des intentions sans chiffre — le PRD refuse de se fixer des cibles qu'il s'interdit d'observer.

### Contre-métriques (ce qu'on surveille pour ne pas gagner de la mauvaise manière)

| # | Contre-métrique | Seuil d'alerte |
|---|---|---|
| C1 | Temps avant le premier signe de vie visible après clic sur « Lancer l'usine » | > 1,5 s |
| C2 | Part de visiteurs qui quittent pendant la construction du graphe | > 25 % |
| C3 | Écart entre nœuds affichés et fibers réellement vivantes dans le runtime | doit rester nul, contrôlé par test |
| C4 | Verdicts du vérificateur non accompagnés d'une source citable | doit rester nul |
| C5 | Poids du bundle initial | dépassement de la cible NFR-007 |
| C6 | Effets visuels qui n'expriment aucun événement réel du moteur | doit rester nul |

> C2 mesure un défaut de rythme, pas un excès d'ambition. On ne répond pas à C2 en rendant le run plus sage : on y répond en le rendant plus lisible et mieux découpé. C6 est le garde-fou symétrique — on impressionne par ce qui se passe, jamais par de la décoration.

---

## 4. Utilisateurs et parcours

Trois personnes utilisent réellement ce produit. Leur contexte est porté dans les parcours, pas dans une section de personas séparée.

### UJ-1 — Camille, recruteuse technique, arrive depuis une candidature

Camille a trente-cinq profils à traiter. Elle ouvre le lien depuis un CV, sur son ordinateur portable, entre deux réunions. Elle ne lira pas de documentation.

Elle tombe sur un champ déjà rempli et un bouton. Elle clique par curiosité. Le graphe commence à pousser immédiatement : des nœuds apparaissent, s'allument, se relient. Une ligne de narration lui dit en français ce que chaque agent est en train de faire. Au bout d'une minute, un bloc lui demande d'approuver ou d'écarter. Elle approuve — c'est le seul moment où on lui demande quelque chose, et elle comprend pourquoi on le lui demande. Un vérificateur d'allégations apparaît. Elle y colle une phrase marketing qu'elle invente sur le moment. Le système lui rend un verdict par allégation, avec le texte réglementaire cité.

Ce qui la fait basculer : le dernier écran ne pouvait pas être préenregistré, puisqu'elle a tapé sa propre phrase.

### UJ-2 — Marc, lead engineer, en entretien technique avec Guillaume

Marc est sceptique par métier. Il a vu des dizaines de démos d'agents. Sa question est toujours la même : « c'est scripté ou pas ? »

Guillaume partage son écran, lance un run, puis ouvre le panneau d'inspection du runtime. Marc voit la liste des fibers vivantes correspondre exactement aux nœuds affichés. Guillaume tue un outil à chaud : le nœud passe en éteint, l'agent qui en dépendait se désactive tout seul, et rien ne casse. Guillaume le relance : l'agent se réactive. Marc pose alors une question sur les coeffects — et la conversation devient technique, ce qui est exactement le but.

Ce qui le fait basculer : la réversibilité observable. Un script de timers ne survit pas à ce test.

### UJ-3 — Sophie, responsable conformité chez une marque de compléments alimentaires

Sophie est arrivée par un autre chemin — une recommandation, un post. Elle se moque du graphe. Elle veut savoir si l'outil peut lire ses fiches produit.

Elle regarde le run distraitement, atteint le vérificateur, et y colle un vrai paragraphe de sa fiche produit. Elle voit ses propres formulations classées, et surtout, la citation du règlement en face de chacune. Elle repère une allégation qu'elle croyait sûre marquée « à vérifier ». Elle veut alors savoir ce que ça donnerait sur son catalogue entier.

Ce qui la fait basculer : le produit lui a appris quelque chose sur son propre travail.

> **Note :** UJ-3 est le pont commercial. Il n'y a pas d'entonnoir de conversion en v1, mais le produit doit laisser une porte ouverte (FR-041).

---

## 5. Le modèle d'exécution : deux modes

C'est la décision structurante du produit, et l'endroit où un PRD peut mentir. Elle est donc traitée en section propre.

### Mode par défaut — composition réelle, raisonnement déterministe

Le run public s'exécute intégralement côté client, sans clé et sans appel réseau vers un fournisseur de LLM. Les agents sont de vrais composants Cordis qui exécutent réellement leur tâche : ils lisent une entrée, produisent une sortie, la publient comme coeffect, et déclenchent l'activation des agents en aval. Leur logique de décision est déterministe et écrite à la main.

Ce que ce mode fait vraiment, et ce n'est pas rien : le graphe est réel, la composition est réelle, la propagation des dépendances est réelle, la réversibilité est réelle, la **génération de composants à l'exécution** est réelle, et le produit livré est réel. Ce qui est déterministe, c'est le *jugement* des agents, pas leur existence ni leur capacité à fabriquer.

Un agent génère un composant en mode déterministe de la même façon qu'un compilateur produit du code : à partir d'une spécification et de règles de composition, sans improvisation. Le composant produit n'existait pas avant le run, il est chargé à chaud, il tourne. Brancher un LLM ne change pas *qu'*un composant soit fabriqué — ça change **à quel point la spécification pouvait être imprévue**.

Ce que ce mode ne fait pas : il ne répond pas à un brief arbitraire. Il travaille dans l'espace du scénario sélectionné. **Le PRD assume cette limite et exige qu'elle soit dite à l'écran** (FR-006), parce qu'une promesse implicite non tenue coûte plus cher que la limite elle-même.

### Mode LLM branché — raisonnement réel, à la demande

Un interrupteur permet de fournir une clé et de brancher un vrai modèle sur un ou plusieurs agents. Ces agents raisonnent alors réellement : ils produisent leur plan, leurs specs, leur critique. Le mode est destiné aux entretiens techniques, aux niches réelles et aux démonstrations privées.

`[ASSUMPTION]` La clé reste en mémoire de session, n'est jamais persistée, et n'est jamais envoyée ailleurs que chez le fournisseur choisi. À confirmer : fournisseur(s) supporté(s) en v1.

### Ce qui est explicitement rejeté

Le run choréographié par timers de `src/usine/run.ts` est abandonné comme moteur. Sont conservés et reportés : le design system, la coquille visuelle, la géométrie du graphe et le moteur de règles du vérificateur d'allégations.

---

## 6. Portée

### Dans la v1

- Un run complet de bout en bout sur le scénario compléments alimentaires.
- Le moteur de composition réel adossé à Cordis, avec coeffects réactifs câblés.
- Le graphe vivant projeté depuis la topologie réelle.
- La porte humaine.
- Le vérificateur d'allégations fonctionnel.
- La génération d'au moins un composant à l'exécution, chargé à chaud, avec retrait propre.
- Les artefacts d'agents consultables et la mémoire de run.
- Le mode LLM branchable sur au moins un agent.
- Un second scénario de niche pour prouver la retargetabilité.
- Le déploiement public.

### Hors v1

- Comptes utilisateurs, persistance de runs, historique.
- Monétisation, facturation, metering.
- Traitement par lot ou import de catalogue (l'attente de Sophie en UJ-3).
- Génération d'un dépôt Git livrable et déployable par les agents. Les agents fabriquent des composants qui tournent dans le runtime de la page (FR-052) ; ils ne produisent pas un projet autonome à cloner.
- Édition manuelle du graphe par l'utilisateur.
- Multi-thème (le produit assume un unique thème clair).

---

## 7. Fonctionnalités et exigences fonctionnelles

> Les identifiants d'exigences sont stables : une exigence ajoutée après coup prend le numéro suivant disponible et rejoint sa section d'appartenance. L'ordre de lecture n'est donc pas l'ordre numérique.

### F1 — Le brief et le lancement

- **FR-001** — L'application présente un champ de brief pré-rempli avec un besoin métier plausible du scénario actif.
- **FR-002** — L'utilisateur peut modifier le texte du brief avant de lancer.
- **FR-003** — Un bouton unique déclenche le run. Le premier signe de vie visible apparaît en moins de 1,5 s.
- **FR-004** — L'utilisateur peut relancer un run à tout moment ; le relancement défait proprement le run précédent (toutes les fibers du run sont libérées).
- **FR-005** — L'utilisateur peut sélectionner un scénario parmi ceux disponibles ; changer de scénario réinitialise le brief et le graphe.
- **FR-006** — Le mode d'exécution actif (déterministe ou LLM branché) est affiché en permanence, sans interaction requise pour le découvrir, et une explication d'une phrase de ce que le mode implique est accessible en un geste depuis cet affichage.

### F2 — Le moteur de composition

- **FR-007** — Chaque agent et chaque outil est un composant Cordis chargé via le runtime, produisant une fiber identifiable.
- **FR-008** — Un composant déclare ses dépendances (`inject`) et ce qu'il expose (`provide`). Il ne s'active que lorsque toutes ses dépendances sont fournies.
- **FR-009** — Un composant se désactive automatiquement lorsqu'une de ses dépendances disparaît, sans erreur et sans état résiduel.
- **FR-010** — Décharger un composant libère en ordre inverse tous les effets qu'il a installés, y compris les composants qu'il a lui-même spawnés (cascade).
- **FR-011** — L'agent maître spawn les composants du run ; décharger l'agent maître libère l'intégralité du run.
- **FR-012** — Le moteur expose une API d'introspection listant, à tout instant, les fibers vivantes, leur état de cycle de vie, et leurs arêtes de dépendance.
- **FR-013** — Le moteur émet un flux d'événements typés (composant créé, activé, désactivé, libéré, message émis, erreur) que l'interface consomme.
- **FR-014** — Un composant qui échoue à l'activation est marqué en erreur sans faire tomber le run. Son nœud porte l'état d'erreur, la narration annonce l'échec, ses dépendants restent inactifs et affichent qu'ils attendent une dépendance qui ne viendra pas.
- **FR-015** — Le moteur fonctionne intégralement dans le navigateur, sans worker ni service distant. **Vérifié le 2026-08-20** : `cordis@4.0.0-rc.8` se bundle sous Vite, n'appelle aucune API native de Node, pèse 11,4 ko gzip, et les treize vérifications du spike passent dans Chrome. Voir `spike-cordis-navigateur.md`.
### F11 — La fabrication à l'exécution

- **FR-052** — Un agent **génère** au moins un composant qui n'existait pas avant le run, à partir d'une spécification produite plus tôt dans la chaîne, et le charge dans le runtime. Le composant généré est un composant de plein droit : il déclare ses dépendances, s'active quand elles sont là, et se libère comme les autres. La fabrication se fait **par composition de primitives, sans évaluation de code**, ce qui la rend compatible avec une politique de sécurité de contenu stricte. Cette voie et celle par évaluation de code ont toutes deux été mesurées le 2026-08-20 (`spike-cordis-navigateur.md`).
- **FR-053** — Le composant généré est consultable : l'utilisateur peut afficher, côte à côte, la spécification dont il découle et le code du composant tel qu'il a été chargé dans le runtime.
- **FR-054** — Un composant généré peut être remplacé à chaud par une nouvelle version sans redémarrer le run, et une version fautive peut être retirée en revenant à l'état antérieur, sans état résiduel.
- **FR-055** — L'agent maître se constitue une mémoire de run — ce qu'il sait du secteur visé et ce qui a été décidé jusqu'ici — et cette mémoire est consultable. Les agents en aval s'y réfèrent plutôt que de repartir du brief brut.

### F3 — Le graphe vivant

- **FR-016** — Le graphe affiche un nœud par composant vivant et une arête par dépendance réelle. Aucun nœud décoratif.
- **FR-017** — Les nœuds apparaissent au fur et à mesure de leur création, pas tous au chargement.
- **FR-018** — Chaque nœud rend visible son état : inactif, en attente de dépendance, en cours, terminé, en erreur, libéré.
- **FR-019** — Une arête s'anime lorsqu'une valeur transite réellement entre deux composants.
- **FR-020** — Survoler un nœud révèle son rôle en une ligne, ses dépendances, et sa technologie lorsqu'il en exécute une (FR-057).
- **FR-021** — Sélectionner un nœud ouvre son détail : ses coeffects entrants et sortants, ses messages, et son état.
- **FR-022** — Le graphe se dispose automatiquement en couches de gauche à droite, sans chevauchement de nœuds ni d'arêtes traversant un nœud.
- **FR-023** — Le graphe se déplace et se zoome. `[ASSUMPTION]` Le zoom est borné pour empêcher un utilisateur de se perdre.
- **FR-024** — Sur écran étroit, le graphe défile dans son propre conteneur ; la page ne défile jamais horizontalement.
- **FR-056** — Le run met en scène un casting minimum, chacun étant un composant vivant : un planificateur, un architecte, au moins deux outils, **au moins trois agents constructeurs qui s'exécutent en parallèle**, un agent sceptique, la porte humaine, un agent de livraison. Chaque constructeur produit un résultat vérifiable dans le runtime de la page — à titre indicatif : un constructeur d'interface qui fabrique un composant d'affichage réel, un constructeur de règles qui fabrique le composant du vérificateur, un constructeur de tests qui exécute de vraies assertions sur ce que les deux autres ont produit et affiche leur résultat.
- **FR-057** — Un nœud n'affiche une étiquette de technologie que si cette technologie tourne réellement derrière lui. Un composant qui ne fait qu'orchestrer affiche ce qu'il orchestre, pas une pile qu'il n'exécute pas. Cette exigence prime sur toute considération d'effet : la largeur affichée doit être une largeur réelle.
- **FR-062** — Un nœud correspondant à un composant généré pendant le run se distingue visuellement d'un composant préexistant. Le visiteur doit pouvoir voir que l'usine a fabriqué une pièce.

### F4 — Les agents qui parlent

- **FR-025** — Chaque agent émet des messages pendant son exécution ; ces messages sont diffusés au fil de l'eau, pas d'un bloc à la fin.
- **FR-026** — Une ligne de narration principale affiche un seul message à la fois, le plus récent, en une phrase. Les messages ne s'empilent pas à l'écran et ne défilent pas : chacun remplace le précédent. Il n'y a jamais plus d'une ligne de narration visible.
- **FR-027** — Le journal complet des messages est consultable, attribué par agent et horodaté.
- **FR-028** — Les messages sont rédigés en français, dans le ton du produit.

### F5 — La porte humaine

- **FR-029** — Avant la livraison, le run s'arrête sur une porte humaine explicite et attend une décision.
- **FR-030** — La porte affiche ce sur quoi porte la décision : ce qui a été produit, et ce que l'agent sceptique a relevé.
- **FR-031** — Approuver poursuit le run jusqu'à la livraison.
- **FR-032** — Écarter interrompt la livraison, libère les composants concernés, et l'affiche — le graphe doit *montrer* la rétractation, pas se figer.
- **FR-033** — Un agent sceptique attaque le résultat avant la porte et produit au moins une objection qui cite un élément précis d'un artefact produit en amont. Une objection générique, non rattachée à un artefact identifiable, ne satisfait pas cette exigence. L'objection est affichée à l'utilisateur avant qu'il décide.

### F6 — Le produit livré (payoff)

- **FR-034** — À l'issue d'un run approuvé, le produit livré apparaît dans la page, monté comme un composant vivant du graphe.
- **FR-035** — Pour le scénario compléments : l'utilisateur colle un texte marketing libre et obtient une analyse par allégation.
- **FR-036** — Chaque allégation détectée reçoit un statut : autorisé, interdit, ou à vérifier.
- **FR-037** — Chaque statut est accompagné de la source qui le justifie, citée et identifiable.
- **FR-038** — Aucun verdict n'est produit sans source. En l'absence de source applicable, le statut est « à vérifier », jamais un verdict tranché.
- **FR-039** — Le verdict est déterministe : le même texte donne le même résultat.
- **FR-040** — L'utilisateur peut effacer et recommencer autant de fois qu'il veut, sans relancer le run.
- **FR-041** — Le bloc de payoff contient un point de contact atteignable sans quitter la page, présenté après le premier résultat et non avant. `[ASSUMPTION]` Un lien de contact suffit en v1.

### F7 — Le mode LLM branché

- **FR-042** — Un interrupteur permet de fournir une clé d'API et de sélectionner les agents qui raisonneront réellement.
- **FR-043** — Quand un agent est branché sur un LLM, son nœud et ses messages l'indiquent visuellement.
- **FR-044** — La clé n'est jamais persistée sur disque, ni journalisée, ni envoyée ailleurs qu'au fournisseur sélectionné.
- **FR-045** — Un compteur de tokens réels s'affiche uniquement dans ce mode ; en mode par défaut il affiche zéro sans faire semblant.
- **FR-046** — Un échec d'appel au LLM (clé invalide, quota, réseau) est signalé sur le nœud concerné et dans la narration, sans casser le run ; l'agent retombe sur son comportement déterministe, et son nœud cesse d'afficher qu'il est branché sur un LLM.

### F8 — Compteurs et lisibilité du run

- **FR-047** — L'interface affiche en direct : nombre d'agents vivants, phase courante, tokens consommés, temps écoulé.
- **FR-048** — Ces compteurs reflètent l'état réel du moteur, jamais une animation décorative.

### F9 — Scénarios et retargetabilité

- **FR-049** — Un scénario est défini par des données : brief par défaut, ensemble de composants, source de vérité, produit livré.
- **FR-050** — Ajouter un scénario ne demande aucune modification du moteur de composition.
- **FR-051** — Au moins deux scénarios sont livrés en v1 pour prouver le point.

### F10 — Les artefacts produits par les agents

C'est l'antidote au « c'est creux » : le visiteur doit pouvoir ouvrir ce que les agents ont réellement écrit.

- **FR-058** — Les agents produisent des artefacts consultables au fil du run : au minimum un découpage en histoires utilisateur, une spécification avec critères d'acceptation, et une décision d'architecture motivée.
- **FR-059** — Cliquer sur un nœud donne accès à l'artefact que ce nœud a produit, dans son état final.
- **FR-060** — Chaque artefact indique de quoi il découle : le brief, la mémoire de run, ou l'artefact d'un agent amont. La chaîne du brief jusqu'au produit livré est traçable de bout en bout.
- **FR-061** — Les artefacts sont rédigés en français. À l'exception de la décision d'architecture, ils n'emploient aucun identifiant de code, aucun nom de fichier et aucun terme du glossaire technique sans le paraphraser.

---

## 8. Exigences non fonctionnelles

### Performance et réactivité

- **NFR-001** — Premier signe de vie après lancement : < 1,5 s.
- **NFR-002** — Le graphe reste fluide (≥ 50 images par seconde `[ASSUMPTION]`) jusqu'à 40 nœuds vivants sur un portable de milieu de gamme.
- **NFR-003** — Le vérificateur d'allégations rend son verdict en moins de 300 ms sur un texte de 2000 caractères.
- **NFR-004** — Aucun blocage du fil principal supérieur à 100 ms pendant un run.

### Frugalité et coût

- **NFR-005** — Un run en mode par défaut n'émet aucune requête vers un fournisseur de LLM.
- **NFR-006** — Aucun coût variable par visiteur. L'hébergement est statique.
- **NFR-007** — Poids du bundle initial : cible < 500 ko gzip `[ASSUMPTION]`.

### Sécurité et confidentialité

- **NFR-008** — Aucun secret n'est embarqué dans le bundle.
- **NFR-023** — Le mode par défaut fonctionne sous une politique de sécurité de contenu stricte, sans `unsafe-eval`. Vérifié le 2026-08-20. Si le mode LLM branché exige un jour l'évaluation de code, l'assouplissement est un arbitrage à poser explicitement, jamais un effet de bord.
- **NFR-009** — Le texte soumis au vérificateur ne quitte jamais le navigateur en mode par défaut.
- **NFR-010** — En mode LLM branché, l'utilisateur est informé explicitement que son contenu part chez le fournisseur, avant le premier appel.
- **NFR-011** — La page compte quatre événements agrégés et rien d'autre : lancement d'un run, arrivée à la porte humaine, apparition du payoff, première soumission au vérificateur. Sans cookie, sans identifiant persistant, sans tiers publicitaire, sans donnée personnelle, et sans jamais transmettre le contenu saisi par l'utilisateur. C'est le minimum qui rend M1, M2 et C2 observables ; au-delà, c'est du suivi et c'est refusé.

### Vérité, déterminisme et audit

- **NFR-012** — Toute sortie du vérificateur est traçable jusqu'à sa source.
- **NFR-013** — La doctrine de la §9 se constate à l'écran : tout verdict affiché indique son origine — produit par une règle déterministe, ou proposé par un LLM et en attente de validation. Un verdict d'origine LLM ne peut pas s'afficher sans cette mention.
- **NFR-014** — Un run produit un journal consultable de ce qui a été décidé et par qui (agent ou humain).

### Accessibilité et compatibilité

- **NFR-015** — Contrastes conformes au niveau AA sur l'ensemble des textes et des états de nœuds.
- **NFR-016** — Le parcours critique (lancer, approuver, utiliser le vérificateur) est accessible au clavier.
- **NFR-017** — L'état d'un nœud n'est jamais signalé par la seule couleur.
- **NFR-018** — Les animations respectent `prefers-reduced-motion` : le run reste compréhensible sans mouvement.
- **NFR-019** — `[ASSUMPTION]` Navigateurs cibles : deux dernières versions majeures de Chrome, Firefox, Safari et Edge.

### Qualité et maintenabilité

- **NFR-020** — TypeScript strict, sans `any` implicite, sur l'ensemble du code produit.
- **NFR-021** — La correspondance entre fibers vivantes et nœuds affichés est couverte par un test automatisé (contre-métrique C3).
- **NFR-022** — Le comportement de réversibilité (spawn, kill, cascade, réactivation) est couvert par des tests.

---

## 9. Doctrine de vérité (héritée de sku-regulator)

Cette doctrine n'est pas une préférence de style : elle est ce qui rend le produit défendable devant une personne du métier.

- Le modèle propose, l'humain et le code déterministe disposent.
- Le LLM est contraint aux données réelles ; il ne produit jamais une source qu'il n'a pas lue.
- Tout verdict incertain remonte à l'humain plutôt que d'être tranché.
- La sortie est déterministe et accompagnée de sa trace.

Elle se re-consomme d'un secteur à l'autre : on change la source de vérité et l'expert qui signe.

---

## 10. Design

Le design est produit dans Claude Design et non ici. Le PRD s'engage uniquement sur ce qui est contractuel pour l'ingénierie.

### Le ton (contractuel)

**Éditorial, aéré, confiant, précis. Comme un studio qui montre une machine impressionnante sans esbroufe.**

Le wahou vient du graphe qui pousse, de la largeur des technologies mobilisées et du payoff réel — jamais d'effets décoratifs. Toute animation exprime un événement réel du moteur (contre-métrique C6). Une interface qui ferait joli sans rien dire du système échoue à cette exigence, même si elle est belle.

### Les invariants visuels

- Design system Memo Labs conservé : crème `#faf9f7`, encre `#16130f`, terracotta `#ad4c16`, Oswald, coins carrés, thème clair unique, fond peint explicitement.
- **Application plein écran, 100vh, sans défilement éditorial** : conversation et brief à gauche, panneau vivant à droite. Pas de hero, pas de sections, pas de page qui scrolle.
- Un seul niveau d'accent. Un seul foyer visuel : le graphe.
- Traits fins, aucune ombre, aucun dégradé, grille de fond très subtile.

### Références d'interaction

Le canvas de **n8n** (nœuds reliés par des câbles courbes, exécution visible nœud par nœud, canvas pannable et zoomable) et le cadrage plateforme d'agents de **Dust** (agents, outils, sources et connexions présentés clairement) donnent la forme. La précision de **Linear** donne la finition. Le calme de **Claude Desktop** donne le layout conversation-plus-panneau-vivant. On emprunte les patterns d'interaction, jamais les couleurs.

### Correction à faire dans les sources

`docs/3-CLAUDE-DESIGN-BRIEF.md` décrit encore une page éditoriale : barre de marque, hero avec titre Oswald géant, largeur de contenu ~920px, sections à `clamp(120px, 18vw, 240px)`. **C'est périmé.** La décision retenue est l'application plein écran ci-dessus. Le brief doit être corrigé avant d'être redonné à un designer, sans quoi il produira le mauvais écran. Le reste du brief — tokens, typographie, formes, comportements du graphe, ton — reste valide et contractuel.

---

## 11. Risques et dépendances

| # | Risque | Impact | Traitement |
|---|---|---|---|
| R1 | ~~Cordis ne se bundle pas dans le navigateur sous Vite~~ | — | **Refermé le 2026-08-20.** Spike exécuté dans Chrome : 13 vérifications sur 13. Aucun repli nécessaire. |
| R2 | Le mode déterministe est perçu comme « encore une démo scriptée » | Tue la promesse centrale | FR-006 (dire le mode), UJ-2 (réversibilité observable), FR-012 (introspection publique) |
| R3 | Le coeffect réactif est plus délicat à câbler que prévu | Retard sur F2, donc sur tout | Le prouver sur un mini-graphe de trois composants avant d'écrire quoi que ce soit d'interface |
| R4 | Le vérificateur d'allégations rend un verdict faux avec une source réelle | Perte de crédibilité auprès du métier (UJ-3) | FR-038 (pas de verdict sans source, défaut sur « à vérifier »), périmètre de règles volontairement étroit et assumé |
| R5 | Le run est spectaculaire mais trop long | Abandon en cours de route (C2) | Cible 60-120 s, possibilité d'accélérer ou de sauter |
| R6 | Le projet dérive et cesse de servir l'objectif numéro un (le CDI) | Coût d'opportunité | Chaque phase se termine par une porte livrable et montrable |
| R7 | La génération de composant à l'exécution (FR-052) reste anecdotique : on fabrique un composant trivial et on appelle ça une usine | Touche la promesse centrale | Le mécanisme est prouvé (spike, 4c et 4d) ; le risque s'est déplacé de « est-ce faisable » vers « est-ce substantiel ». Q9 doit dire ce qui est fabriqué, et la réponse doit être défendable devant Marc (UJ-2) |
| R8 | La sobriété du design finit par tuer le spectacle (O6 sacrifié à la retenue) | Le run n'impressionne plus personne | Le ton contractuel de §10 tranche : impressionner par ce qui se passe. C2 et C6 se surveillent ensemble, jamais l'une contre l'autre |

---

## 12. Phasage

- **Phase 0 — Fondations.** ✅ **Porte franchie le 2026-08-20.** Faisabilité navigateur de Cordis vérifiée dans Chrome, coeffect réactif prouvé (activation, désactivation, réactivation), cascade et réversion en ordre inverse prouvées, génération de composant à l'exécution prouvée dans ses deux voies. Reste à figer le contrat de composant à partir de ce qui a été mesuré.
- **Phase 1 — Le run réel et le graphe.** Moteur de run, flux d'événements, graphe projeté, narration, porte humaine. *Porte : un run complet réel, de bout en bout, sans LLM.*
- **Phase 2 — Le payoff.** Vérificateur d'allégations fonctionnel, sourcé, déterministe. *Porte : un visiteur colle son propre texte et obtient un verdict juste et sourcé.*
- **Phase 3 — LLM branchable.** Interrupteur, agents raisonnants, garde-fous et repli. *Porte : sur un brief simple, un agent réel produit un plan exploitable.*
- **Phase 4 — Déploiement et seconde niche.** Mise en ligne sur `usine.memolabs.dev`, entrée dans le hub, second scénario. *Porte : montrable publiquement et en entretien.*

---

## 13. Questions ouvertes

Aucune de ces questions ne rend le PRD inexploitable en aval — elles sont portées par la phase nommée en dernière colonne. Q2, Q9 et Q10 sont le travail de `bmad-architecture`. Q3 se referme en lisant `src/usine/run.ts`. Q4 et Q5 appellent une décision de Guillaume au moment de la phase concernée. Q8 est un arbitrage de cible, révisable après la première mise en ligne.

| # | Question | Porté par |
|---|---|---|
| ~~Q1~~ | ~~Cordis tourne-t-il dans le bundle navigateur ?~~ **Close le 2026-08-20 : oui, client-only, aucun repli.** | — |
| Q2 | Que fait réellement chaque agent en mode déterministe — quelle est sa sortie concrète ? | Architecture, épics |
| Q3 | Quel est le second scénario de niche ? `src/usine/run.ts` en contient déjà trois (ClaimCheck, Pulse, Tandem) : la réponse est probablement à lire, pas à inventer. | Épics, phase 4 |
| Q4 | Quelle est la source de vérité exacte du vérificateur, et jusqu'où va sa couverture assumée ? | Phase 2, crédibilité métier |
| Q5 | Quel(s) fournisseur(s) de LLM en v1 ? | Phase 3 |
| Q8 | Les cibles chiffrées marquées `[ASSUMPTION]` (M1, M2, NFR-002, NFR-007) sont-elles les bonnes ? | Validation du PRD |
| Q9 | Quel composant exactement l'usine fabrique-t-elle à l'exécution (FR-052) ? Le **mécanisme** est prouvé et la voie est tranchée (composition, sans eval) ; reste à dire **quoi** on fabrique, et que ce soit substantiel. | Architecture, phase 1 |
| Q10 | La mémoire de run (FR-055) est-elle rédigée à la main par scénario, ou dérivée du brief ? | Architecture |

---

## Glossaire

- **Composant** — unité chargeable du runtime Cordis, produisant une fiber. Un agent ou un outil en est un.
- **Spawner** — charger un composant dans le runtime depuis un autre composant, ce qui crée une fiber enfant dont la libération suit celle du parent.
- **Composant généré** — composant qui n'existait pas avant le run, fabriqué à l'exécution par un agent à partir d'une spécification, puis chargé à chaud (FR-052).
- **Fiber** — instance vivante d'un composant chargé, disposable, dont la libération annule ses effets.
- **Coeffect** — dépendance déclarée (`inject`) ou capacité exposée (`provide`) par un composant ; c'est ce qui forme les arêtes du graphe.
- **Artefact** — document produit par un agent pendant le run et consultable par l'utilisateur : découpage en histoires, spécification, décision d'architecture (F10).
- **Mémoire de run** — ce que l'agent maître sait du secteur visé et ce qui a été décidé depuis le début du run ; consultable, et référencée par les agents en aval (FR-055).
- **Casting** — l'ensemble des agents et outils qu'un run met en scène, chacun étant un composant vivant (FR-056).
- **Scénario** — jeu de données définissant un run : brief par défaut, composants, source de vérité, produit livré (FR-049).
- **Porte humaine** — point d'arrêt du run où une décision humaine est requise avant de poursuivre.
- **Payoff** — le produit fonctionnel livré à la fin du run.
- **Run** — une exécution complète, du brief à la livraison.

---

## Index des assumptions

Chaque inférence non confirmée par Guillaume, avec sa localisation. À trancher avant l'architecture.

| Localisation | Assumption |
|---|---|
| §2, problème externe | Aucune plateforme du domaine ne montre une composition d'agents qui se construit elle-même. Lecture du paysage non validée par une étude. |
| §3, M1 | Cible de 60 % de visiteurs allant au bout d'un run. |
| §3, M2 | Cible de 30 % de visiteurs utilisant le produit livré. |
| §3, C5 | Seuil d'alerte du bundle initial à 500 ko gzip. |
| §5, mode LLM | La clé reste en mémoire de session, jamais persistée, jamais envoyée ailleurs que chez le fournisseur choisi. Fournisseurs supportés en v1 non arrêtés. |
| §7, FR-023 | Le zoom du graphe est borné. |
| §7, FR-041 | Un lien de contact suffit comme point de sortie en v1. |
| §8, NFR-002 | Cible de fluidité à 50 images par seconde jusqu'à 40 nœuds. |
| §8, NFR-007 | Cible de bundle initial sous 500 ko gzip. |
| §8, NFR-019 | Navigateurs cibles : deux dernières versions majeures de Chrome, Firefox, Safari, Edge. |
