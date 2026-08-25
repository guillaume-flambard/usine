---
title: "L'usine agentique — PRD"
status: final
created: 2026-08-20
updated: 2026-08-21
---

# L'usine agentique — PRD

**Produit :** L'usine agentique (pièce « Lab » phare de Memo Labs)
**Domaine cible :** `usine.memolabs.dev`
**Auteur :** Guillaume (Memo), avec facilitation BMad
**Statut :** finalisé le 2026-08-20

> Les passages marqués `[ASSUMPTION]` sont des inférences faites à partir de `docs/` et récapitulées dans l'**Index des assumptions**, en annexe. Ils sont assumés en l'état ; les confirmer ou les corriger relève de l'architecture, pas d'un blocage du PRD.

> **Révision du 2026-08-21.** Ce PRD a été mis à jour après un pivot produit décidé en séance : le livrable n'est plus une fonction rendue après la porte humaine, mais une **application vivante servie pendant le run et remplacée à chaud par les agents**. La mise à jour réconcilie aussi une dérive antérieure — le produit déployé s'est éloigné de plusieurs exigences de la v1 écrite le 2026-08-20. Les exigences que ces décisions retirent portent la mention **Caduc au 2026-08-21** et gardent leur identifiant, avec le renvoi vers ce qui les remplace. Le détail des décisions est dans `.memlog.md`.

> **Documents liés.** `addendum.md` porte la profondeur technique et les alternatives écartées. `spike-cordis-navigateur.md` porte la preuve de faisabilité du moteur. `review-rubric.md` porte la revue qualité. Les quatre fichiers `reconcile-*.md` portent la confrontation aux sources d'origine.

---

## 1. Résumé exécutif

L'usine agentique est une application web dans laquelle un visiteur écrit un brief métier en langage naturel et regarde un système agentique se construire lui-même pour y répondre : des agents et des outils apparaissent réellement, se câblent entre eux, exécutent, s'expriment — et **posent en quelques secondes une application utilisable, qu'ils continuent de remplacer à chaud pendant que le visiteur s'en sert**. La porte humaine décide ensuite de l'emporter ou de l'écarter.

La promesse tient sur cinq affirmations non négociables :

1. **Les agents sont réels.** Chaque agent et chaque outil est un composant Cordis vivant (une fiber), pas une entrée d'un script de timers. Le graphe affiché est la projection de la topologie réelle du runtime.
2. **L'usine fabrique ses propres pièces.** Les agents ne se contentent pas d'assembler un catalogue fermé : ils **génèrent des composants à l'exécution** et les chargent à chaud. Un composant généré qui se comporte mal se retire proprement. C'est ce qui sépare une orchestration d'une usine, et c'est la raison d'être du choix de Cordis.
3. **Le produit est vivant, pas livré en fin de course.** L'application apparaît en quelques secondes, le visiteur s'en sert pendant que le run continue, et les agents la remplacent sous ses doigts — **en réponse à ce qu'il en fait** (voir cycle B), sans redémarrage et sans perdre son état. C'est la seule chose que le paradigme de composabilité spatiotemporelle apporte et que personne d'autre ne montre ; c'est donc ce que le produit doit montrer.
4. **Ça reste regardable quand le modèle ne répond pas.** Quota atteint, crédit épuisé, relais muet : le site rejoue un run enregistré et le dit. Le repli n'est pas un filet honteux, c'est une surface produit tenue au même niveau d'exigence que le direct.

5. **Ça doit impressionner.** Pas par des effets décoratifs — par ce qui se passe réellement à l'écran : un système qui se construit lui-même sous les yeux du visiteur, avec la largeur de technologies qu'il mobilise, et qui finit par lui tendre un outil qui marche. Le spectacle est un objectif du produit, pas un dommage collatéral qu'on tolère.

Ce PRD couvre la v1 déployée le 2026-08-20 et les deux cycles qui la rendent défendable : **A** — l'application vivante et son remplacement à chaud ; **A′** — les sources réelles, l'emport et le rejeu.

> **Repositionnement du 2026-08-24 (voir `docs/5-ANGLE.md`).** L'emphase se
> déplace : le hot-swap n'est pas d'abord un spectacle qui prouve le moteur
> (affirmation 5), mais **la valeur que l'utilisateur final ressent en usage** —
> l'outil mue autour de lui, en réponse à ce qu'il tape, et son travail survit à
> chaque changement. Le spectacle sert cette valeur, il ne la précède plus.
> **Cycle B (livré le 2026-08-24) — la boucle réactive minimale** : une
> interaction du visiteur devient un événement `visitor-interacted` dans le flux,
> réveille l'agent qui a écrit le comportement, et déclenche un remplacement à
> chaud en réponse ; l'échec d'activation laisse la version précédente servir ;
> un rejeu reproduit la recomposition depuis le seul flux. Le produit **reste
> brief-agnostique** : la suppression du vérificateur figé (F6/FR-035…) tient
> toujours — la conformité reste un cas d'usage exemplaire, pas un beachhead
> rouvert.

> **Cible produit changée le 2026-08-24 (voir `docs/7-MIGRATION.md`).** Le
> produit devient **l'atelier de pré-prod qui forke la timeline d'un agent** :
> rejouer une trajectoire qui a planté, forker à l'instant du problème, remplacer
> l'agent à chaud sur la branche, montrer deux futurs sous porte humaine avant la
> prod. Le marché visé n'est pas « un logiciel qui mue » mais **la peur de
> changer ses agents en prod** (Gartner : >40 % des projets annulés d'ici 2027).
> Les invariants de ce PRD et de la spine (état hors du remplaçable, remplacement
> réversible, rejeu depuis le flux) sont **réutilisés tels quels** comme
> fondations du fork ; les cycles A/A′/B ci-dessus ont construit ces primitives.
> **Fork gap** à bâtir : hydrater un kernel vivant depuis un préfixe de flux.
> **Deux garde-fous d'honnêteté** : le rollback est *intra-runtime* (prévenir
> avant, pas réparer après) ; on tient une **primitive**, jamais une « plateforme
> de fiabilité » ni un « control plane ». La feuille de route (spike fork,
> signaux recruteurs, moat OSS, import de traces externes) est dans `docs/7`.

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
- **O3.** *Refondu au 2026-08-21.* L'application produite est utilisable **pendant le run**, et le visiteur repart avec.
- **O4.** *Refondu au 2026-08-21.* Aucun secret ne touche le client, et la capacité est bornée par visiteur comme globalement — un run coûte des tokens, ce coût est tenu et affiché.
- **O5.** Le moteur est retargetable. *Amendé :* ce n'est plus un objectif à atteindre mais une propriété acquise — rien n'étant déclaré, il n'y a rien à retargeter.
- **O7.** *Nouveau au 2026-08-21.* Un observateur voit le système **se modifier pendant qu'il sert** : au moins un remplacement à chaud, sans redémarrage et sans perte de ce qu'il a fait. C'est l'objectif qui distingue ce produit d'un générateur de code.
- **O6.** Le run impressionne. Un visiteur qui n'a rien demandé reste jusqu'au bout parce que ce qu'il voit est spectaculaire — la construction elle-même, la largeur des technologies mobilisées, le basculement final vers un objet utilisable.

### Métriques de succès

| # | Métrique | Cible v1 |
|---|---|---|
| M1 | Part des visiteurs qui vont jusqu'au bout d'un run | ≥ 60 % `[ASSUMPTION]` |
| M2 | Part des visiteurs qui soumettent au moins une entrée à l'application produite | ≥ 30 % `[ASSUMPTION]` |
| M3 | Délai jusqu'au premier écran utilisable | < 15 s (FR-073) |
| M4 | Coût d'un run en direct | borné par visiteur ; suivi en euros par jour |
| M5 | *Caduque au 2026-08-21* (plus de scénarios). Remplacée par M7. | — |
| M7 | **Part des runs comportant au moins un remplacement à chaud réussi** | ≥ 50 % — c'est la métrique de O7, et la seule qui dise si la démonstration a réellement lieu |
| M8 | Part des visiteurs servis par le rejeu plutôt que par un run en direct | suivi, sans cible : elle dit quand la capacité devient le facteur limitant |
| M6 | Mentions du projet en entretien qui débouchent sur une question technique de fond plutôt qu'un « joli » poli | qualitatif et assumé comme tel : journal tenu par Guillaume, pas de seuil |

> M1, M2 et C2 sont des métriques d'entonnoir. Elles ne sont mesurables que parce que NFR-011 autorise le comptage agrégé de quatre événements. Sans cette instrumentation, ces trois lignes seraient des intentions sans chiffre — le PRD refuse de se fixer des cibles qu'il s'interdit d'observer.

### Contre-métriques (ce qu'on surveille pour ne pas gagner de la mauvaise manière)

| # | Contre-métrique | Seuil d'alerte |
|---|---|---|
| C1 | Temps avant le premier signe de vie visible après clic sur « Lancer l'usine » | > 1,5 s |
| C2 | Part de visiteurs qui quittent pendant la construction du graphe | > 25 % |
| C3 | Écart entre nœuds affichés et fibers réellement vivantes dans le runtime | doit rester nul, contrôlé par test |
| C4 | *Caduque au 2026-08-21* (plus de vérificateur). Remplacée par C7. | — |
| C7 | Runs où l'application n'a jamais servi avant la porte humaine | doit rester nul : c'est le retour à l'ancien produit |
| C8 | Runs se terminant sans aucune application produite | > 20 % |
| C9 | Visiteurs rencontrant une capacité épuisée sans se voir proposer le rejeu | doit rester nul |
| C5 | Poids du bundle initial | dépassement de la cible NFR-007 |
| C6 | Effets visuels qui n'expriment aucun événement réel du moteur | doit rester nul |

> C2 mesure un défaut de rythme, pas un excès d'ambition. On ne répond pas à C2 en rendant le run plus sage : on y répond en le rendant plus lisible et mieux découpé. C6 est le garde-fou symétrique — on impressionne par ce qui se passe, jamais par de la décoration.

---

## 4. Utilisateurs et parcours

Trois personnes utilisent réellement ce produit. Leur contexte est porté dans les parcours, pas dans une section de personas séparée.

### UJ-1 — Camille, recruteuse technique, arrive depuis une candidature

Camille a trente-cinq profils à traiter. Elle ouvre le lien depuis un CV, sur son ordinateur portable, entre deux réunions. Elle ne lira pas de documentation.

*Parcours refondu au 2026-08-21.* Elle tombe sur un champ **vide** et trois exemples. Elle en clique un, le texte s'inscrit, elle le modifie en deux mots — son propre besoin — et lance. Pendant une dizaine de secondes elle lit la machine réfléchir, en français. Puis une petite application apparaît, moche et incomplète : un bouton est grisé, marqué « en construction ». Elle essaie l'autre, ça marche. Le bouton grisé s'allume pendant qu'elle regarde. Elle s'en sert encore ; une étiquette passe de v1 à v2 sous ses yeux, et ce qu'elle a déjà fait est toujours là. Une ligne dit : *2 remplacements à chaud, 0 redémarrage, 5 interactions conservées.* On lui demande alors si elle emporte.

Ce qui la fait basculer : elle a modifié le brief elle-même, et l'application a changé **pendant** qu'elle s'en servait. Aucune des deux choses ne peut être préenregistrée.

### UJ-2 — Marc, lead engineer, en entretien technique avec Guillaume

Marc est sceptique par métier. Il a vu des dizaines de démos d'agents. Sa question est toujours la même : « c'est scripté ou pas ? »

Guillaume partage son écran, lance un run, puis ouvre le panneau d'inspection du runtime. Marc voit la liste des fibers vivantes correspondre exactement aux nœuds affichés. Guillaume tue un outil à chaud : le nœud passe en éteint, l'agent qui en dépendait se désactive tout seul, et rien ne casse. Guillaume le relance : l'agent se réactive. Marc pose alors une question sur les coeffects — et la conversation devient technique, ce qui est exactement le but.

*Ajouté au 2026-08-21 :* Guillaume lui montre ensuite le test que rien d'autre ne passe — il laisse un agent remplacer un comportement pendant que l'application sert, et le journal d'interactions ne perd rien. Puis il force une version fautive : elle est refusée, la précédente reprend la main, l'application n'a pas cligné.

Ce qui le fait basculer : la réversibilité observable, et le remplacement à chaud sous charge. Un script de timers ne survit pas au premier test ; un générateur de code ne survit pas au second.

### UJ-3 — Sophie, responsable d'un métier, arrivée par une recommandation

*Parcours réécrit au 2026-08-21 : Sophie n'est plus attachée au secteur des compléments alimentaires, puisqu'il n'y a plus de scénario. Elle représente la personne qui se moque du graphe et veut savoir si ça sert à quelque chose.*

Sophie décrit en une phrase une tâche fastidieuse de sa semaine. Elle regarde le run distraitement. Une application apparaît qui fait exactement cette tâche, mal. Elle l'essaie sur un cas réel, obtient un résultat à moitié juste — puis voit l'application se corriger pendant qu'elle est encore dessus. Elle la ré-essaie : c'est mieux. Elle télécharge le fichier.

Ce qui la fait basculer : elle repart avec quelque chose, et ce quelque chose est né de sa phrase.

> **Note :** UJ-3 est le pont commercial. La sortie doit laisser une porte ouverte : l'emport (FR-075) et le lien de rejeu (FR-076) au minimum, le reste est ouvert (Q11).

---

## 5. Le modèle d'exécution : trois modes

C'est la décision structurante du produit, et l'endroit où un PRD peut mentir. Elle est donc traitée en section propre.

La v1 écrite le 2026-08-20 tenait sur deux modes, dont un mode par défaut sans réseau ni tokens. **Cette architecture a été abandonnée en séance le 2026-08-20** : un jugement d'agent écrit à la main est un graphe connu d'avance, quoi qu'on en dise à l'écran. Le produit a donc basculé sur un raisonnement réel par défaut, et le mode sans réseau est devenu un repli.

### Mode direct — un modèle raisonne, la clé reste au serveur

Le mode nominal. Le navigateur parle à un relais servi par la même origine, dans le même conteneur ; le relais porte la clé et appelle le fournisseur. La clé ne touche jamais le client. Les agents raisonnent réellement : ils décident qui créer, quoi écrire, quoi remplacer. Rien du graphe n'est connu avant que le visiteur ait écrit son brief.

Ce que ce mode coûte, et qu'il faut dire : le brief part chez le fournisseur, chaque run consomme des tokens, et la capacité du jour est finie. Ces trois faits sont affichés, pas dissimulés (FR-006, NFR-010, NFR-025).

### Mode rejeu — un run réel enregistré, rejoué à l'identique

Le repli, et l'expérience majoritaire tant que la capacité est ce qu'elle est. Un run réel a été enregistré sous forme de flux d'événements ; le rejouer reproduit exactement ce qui s'est passé, sans modèle et sans réseau. Il est annoncé comme un rejeu, jamais présenté comme un direct (FR-077).

Ce mode n'est pas une consolation : c'est ce que voit un visiteur arrivé après le quarantième run du jour, donc il est tenu au même niveau d'exigence et couvert par les mêmes tests (NFR-027).

### Mode déterministe — le moteur sans jugement

Aucun modèle ne raisonne. Le moteur de composition, lui, fonctionne : composants, coeffects, cascade, réversion. Ce mode ne produit pas d'application — il ne peut rien inventer, et il le dit. Il sert aux tests et à la démonstration du moteur seul.

### Ce qui est explicitement rejeté

Le run chorégraphié par timers de `src/usine/run.ts` est abandonné comme moteur. Sont conservés et reportés : le design system, la coquille visuelle et la géométrie du graphe.

Est également rejeté, depuis le 2026-08-20 : **tout casting d'agents déclaré avant le brief**. Un run où les mêmes agents apparaissent quelle que soit la demande est une animation, pas une usine.

---

## 6. Portée

### Livré le 2026-08-20

- Le moteur de composition réel adossé à Cordis, avec coeffects réactifs câblés.
- Le graphe vivant projeté depuis la topologie réelle, sans casting déclaré.
- Des agents libres qui créent d'autres agents, s'interrogent, et écrivent du code chargé à chaud.
- La porte humaine.
- Le relais de raisonnement, clé côté serveur.
- Le déploiement public sur `usine.memolabs.dev`.

### Dans le cycle A

- L'application vivante servie pendant le run, dans un cadre isolé.
- Le remplacement à chaud d'un comportement par un agent, avec retour arrière prouvé.
- L'état du visiteur qui survit aux remplacements, et le compteur qui le dit.
- L'exécution des comportements dans un fil isolé.
- Le budget par visiteur et le repli par rejeu.
- Le chemin court vers le premier écran.

### Dans le cycle A′

- Les sources de données réelles sur liste blanche.
- L'emport de l'application produite.
- L'export et le rejeu partageable d'un run.

### Hors v1

- Comptes utilisateurs, persistance de runs, historique.
- Monétisation, facturation, metering.
- Traitement par lot ou import de catalogue (l'attente de Sophie en UJ-3).
- Génération d'un dépôt Git livrable et déployable par les agents. Les agents fabriquent des composants qui tournent dans le runtime de la page (FR-052) ; ils ne produisent pas un projet autonome à cloner. L'emport (FR-075) livre un fichier autonome, pas un projet.
- Vérification automatique de ce que les agents produisent (cycle B), mémoire de run alimentée par les agents, bibliothèque de compétences persistée d'un run à l'autre, outillage découvert par MCP. Ces quatre chantiers sont nommés au §12 et hors des cycles A et A′.
- Édition manuelle du graphe par l'utilisateur.
- Multi-thème (le produit assume un unique thème clair).

---

## 7. Fonctionnalités et exigences fonctionnelles

> Les identifiants d'exigences sont stables : une exigence ajoutée après coup prend le numéro suivant disponible et rejoint sa section d'appartenance. L'ordre de lecture n'est donc pas l'ordre numérique.

### F1 — Le brief et le lancement

- **FR-001** — L'application présente un champ de brief **vide**. Trois exemples cliquables **écrivent leur texte dans le champ** sans lancer le run : le visiteur voit le texte s'inscrire, peut le corriger, et c'est lui qui soumet. Un brief pré-rempli et soumis tel quel ruinerait la preuve que rien n'est enregistré d'avance.
- **FR-002** — L'utilisateur peut modifier le texte du brief avant de lancer.
- **FR-003** — Un bouton unique déclenche le run. Le premier signe de vie visible apparaît en moins de 1,5 s.
- **FR-004** — L'utilisateur peut relancer un run à tout moment ; le relancement défait proprement le run précédent (toutes les fibers du run sont libérées).
- **FR-005** — **Caduc au 2026-08-21.** Il n'y a plus de scénarios : le run part du brief et de rien d'autre. Voir §5, « ce qui est explicitement rejeté ».
- **FR-006** — Le mode d'exécution actif (direct, rejeu ou déterministe) est affiché en permanence, sans interaction requise pour le découvrir, et une explication d'une phrase de ce que le mode implique est accessible en un geste depuis cet affichage.

### F2 — Le moteur de composition

- **FR-007** — Chaque agent et chaque outil est un composant Cordis chargé via le runtime, produisant une fiber identifiable.
- **FR-008** — Un composant déclare ses dépendances (`inject`) et ce qu'il expose (`provide`). Il ne s'active que lorsque toutes ses dépendances sont fournies.
- **FR-009** — Un composant se désactive automatiquement lorsqu'une de ses dépendances disparaît, sans erreur et sans état résiduel.
- **FR-010** — Décharger un composant libère en ordre inverse tous les effets qu'il a installés, y compris les composants qu'il a lui-même spawnés (cascade).
- **FR-011** — L'agent maître spawn les composants du run ; décharger l'agent maître libère l'intégralité du run.
- **FR-012** — Le moteur expose une API d'introspection listant, à tout instant, les fibers vivantes, leur état de cycle de vie, et leurs arêtes de dépendance.
- **FR-013** — Le moteur émet un flux d'événements typés (composant créé, activé, désactivé, libéré, message émis, erreur) que l'interface consomme.
- **FR-014** — Un composant qui échoue à l'activation est marqué en erreur sans faire tomber le run. Son nœud porte l'état d'erreur, la narration annonce l'échec, ses dépendants restent inactifs et affichent qu'ils attendent une dépendance qui ne viendra pas.
- **FR-015** — Le **moteur de composition** fonctionne intégralement dans le navigateur : aucune fiber, aucun coeffect, aucune cascade ne dépend d'un service. *Amendé au 2026-08-21 :* la formulation d'origine disait « sans worker ni service distant », et ces deux termes sont tombés — le raisonnement passe par un relais de même origine (§5), et les comportements écrits par le modèle s'exécutent dans un fil isolé (FR-072). Ce que l'exigence protégeait vraiment — un moteur qui ne délègue pas sa composition — tient. **Vérifié le 2026-08-20** : `cordis@4.0.0-rc.8` se bundle sous Vite, n'appelle aucune API native de Node, pèse 11,4 ko gzip, et les treize vérifications du spike passent dans Chrome. Voir `spike-cordis-navigateur.md`.
### F11 — La fabrication à l'exécution

- **FR-052** — Un agent **génère** au moins un composant qui n'existait pas avant le run, à partir d'une spécification produite plus tôt dans la chaîne, et le charge dans le runtime. Le composant généré est un composant de plein droit : il déclare ses dépendances, s'active quand elles sont là, et se libère comme les autres. *Amendé au 2026-08-21 :* la fabrication se fait **par évaluation réelle du code écrit par le modèle**. La voie par composition de primitives, retenue à l'origine pour préserver une politique de sécurité stricte, a été écartée en séance le 2026-08-20 — elle enferme les agents dans un vocabulaire clos, donc rien d'imprévu ne peut naître. L'arbitrage est posé explicitement : `script-src` autorise `unsafe-eval`, et l'isolement est reporté sur le fil d'exécution (FR-072, NFR-023, NFR-024). Les deux voies avaient été mesurées le 2026-08-20 (`spike-cordis-navigateur.md`).
- **FR-053** — Le composant généré est consultable : l'utilisateur peut afficher, côte à côte, la spécification dont il découle et le code du composant tel qu'il a été chargé dans le runtime.
- **FR-054** — Un composant généré peut être remplacé à chaud par une nouvelle version sans redémarrer le run, et une version fautive peut être retirée en revenant à l'état antérieur, sans état résiduel. *Amendé au 2026-08-21 :* cette capacité existait dans le moteur mais **aucun agent ne pouvait l'appeler**. Elle devient une action du vocabulaire des agents (FR-066) et le cœur de la démonstration.
- **FR-055** — *Reporté au chantier « mémoire de run » (§12), hors cycles A et A′.* L'agent maître se constitue une mémoire de run — ce qu'il sait du secteur visé et ce qui a été décidé jusqu'ici — et cette mémoire est consultable. Les agents en aval s'y réfèrent plutôt que de repartir du brief brut.

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
- **FR-056** — **Caduc au 2026-08-20.** Un casting minimum déclaré — planificateur, architecte, sceptique, agent de livraison — est exactement ce que le produit refuse : quelle que soit la demande, les mêmes agents apparaîtraient. Le nombre et la nature des agents sortent du brief, ou ils ne veulent rien dire. Ce que l'exigence cherchait à garantir — que le run soit substantiel, pas un agent unique — passe par les budgets (§5) et par FR-063.
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
- **FR-031** — *Amendé au 2026-08-21 :* la porte n'approuve plus une livraison à venir, elle statue sur une application **que le visiteur utilise déjà** (FR-063). Le geste devient **emporter** : l'application est validée et rendue emportable (FR-075).
- **FR-032** — Écarter libère les composants et l'affiche — le graphe doit *montrer* la rétractation, pas se figer. *Amendé au 2026-08-21 :* écarter détruit maintenant quelque chose dont le visiteur se sert ; ce que le geste coûte est écrit à côté du bouton, avant le clic.
- **FR-033** — Un agent sceptique attaque le résultat avant la porte et produit au moins une objection qui cite un élément précis d'un artefact produit en amont. Une objection générique, non rattachée à un artefact identifiable, ne satisfait pas cette exigence. L'objection est affichée à l'utilisateur avant qu'il décide.

### F6 — Le produit

*Section refondue au 2026-08-21. Le produit n'est plus un vérificateur d'allégations connu d'avance : c'est ce que les agents fabriquent, et il vit pendant le run. La mécanique est en F12.*

- **FR-034** — *Inversé au 2026-08-21 :* le produit n'apparaît plus à l'issue d'un run approuvé. Il apparaît **dès qu'il existe**, sert pendant le run, et la porte décide de son sort (FR-063, FR-031).
- **FR-035** — **Caduc au 2026-08-21.** Le scénario compléments alimentaires n'existe plus.
- **FR-036** — **Caduc au 2026-08-21.** Idem : plus de statuts d'allégation.
- **FR-037** — **Caduc au 2026-08-21** *dans sa forme*. Le principe survit et se déplace : un comportement branché sur une source réelle indique la source dont il tient sa réponse (FR-074, §9).
- **FR-038** — **Caduc au 2026-08-21** *dans sa forme*. Le principe survit : pas d'affirmation sans source, défaut sur l'incertitude (§9).
- **FR-039** — **Caduc au 2026-08-21.** Un produit écrit par un modèle n'est pas déterministe d'un run à l'autre, et le prétendre serait faux. Ce qui est déterministe et le reste : **le rejeu d'un run enregistré** (FR-076).
- **FR-040** — Le visiteur peut soumettre autant d'entrées qu'il veut à l'application, sans relancer le run.
- **FR-041** — *Amendé au 2026-08-21 :* un lien `mailto:` ne suffit plus comme unique sortie pour la pièce phare de Memo Labs. La sortie offre au minimum l'emport de l'application (FR-075) et le lien de rejeu du run (FR-076). La forme de la mise en relation reste ouverte (Q11).

### F7 — Le raisonnement, le relais et sa capacité

*Section refondue au 2026-08-21 : la clé n'est plus fournie par le visiteur, elle vit côté serveur.*

- **FR-042** — **Caduc au 2026-08-21.** Le visiteur ne fournit plus de clé et ne choisit plus quels agents raisonnent : tous raisonnent, et la clé est au serveur.
- **FR-043** — Le mode actif est visible sur la page et sur les nœuds : un run en direct et un run rejoué ne se confondent jamais (FR-006, FR-077).
- **FR-044** — **Caduc au 2026-08-21** *dans sa forme*, renforcé sur le fond : la clé ne transite jamais par le client, n'entre pas dans le paquet servi, et n'est lisible que par le relais.
- **FR-045** — Un compteur de tokens réels s'affiche pendant un run en direct. En rejeu, il montre ce que le run enregistré avait consommé, en le disant.
- **FR-046** — Un échec d'appel (relais muet, quota, réseau, réponse illisible) est signalé sur le nœud concerné et dans la narration, sans casser le run. *Amendé au 2026-08-21 :* il n'y a plus de repli déterministe par agent — un agent qui ne peut plus raisonner s'arrête en le disant, et le run se poursuit avec les autres.
- **FR-078** — La capacité restante du jour est affichée honnêtement avant le lancement. Quand elle est épuisée, le visiteur se voit proposer le rejeu au lieu d'un échec (NFR-025, NFR-026).

### F8 — Compteurs et lisibilité du run

- **FR-047** — L'interface affiche en direct : nombre d'agents vivants, phase courante, tokens consommés, temps écoulé.
- **FR-048** — Ces compteurs reflètent l'état réel du moteur, jamais une animation décorative.

### F9 — Retargetabilité

*Section refondue au 2026-08-21.*

- **FR-049** — **Caduc au 2026-08-21.** Un scénario défini en données — brief par défaut, composants, source de vérité, produit livré — est précisément un graphe connu d'avance.
- **FR-050** — Tient toujours, et gratuitement : rien n'étant déclaré, il n'y a rien à modifier pour changer de domaine. La retargetabilité n'est plus une fonctionnalité, c'est une conséquence.
- **FR-051** — **Caduc au 2026-08-21.** Remplacé par une preuve plus forte : deux briefs inventés sur place par un tiers, produisant deux applications différentes.

### F10 — Les artefacts produits par les agents

C'est l'antidote au « c'est creux » : le visiteur doit pouvoir ouvrir ce que les agents ont réellement écrit.

- **FR-058** — Les agents produisent des artefacts consultables au fil du run. *Amendé au 2026-08-21 :* la liste imposée — histoires utilisateur, spécification, décision d'architecture — supposait un casting déclaré ; elle tombe. Ce qui reste exigible, et qui est plus fort : **le code de chaque comportement écrit pendant le run est consultable**, avec l'agent qui l'a écrit et le numéro de version.
- **FR-059** — Cliquer sur un nœud donne accès à l'artefact que ce nœud a produit, dans son état final.
- **FR-060** — Chaque artefact indique de quoi il découle : le brief, la mémoire de run, ou l'artefact d'un agent amont. La chaîne du brief jusqu'au produit livré est traçable de bout en bout.
- **FR-061** — Les artefacts sont rédigés en français. À l'exception de la décision d'architecture, ils n'emploient aucun identifiant de code, aucun nom de fichier et aucun terme du glossaire technique sans le paraphraser.

### F12 — L'application vivante et le remplacement à chaud (cycle A)

C'est le cœur du produit après le 2026-08-21, et la seule chose que le paradigme choisi apporte et qu'on ne voit nulle part ailleurs. L'exigence de fond : **le système se modifie pendant qu'il sert**, et rien de ce que le visiteur a accumulé n'est perdu.

- **FR-063** — Dès qu'un écran et un comportement existent, l'application est servie dans la page et le visiteur peut s'en servir — sans attendre la fin du run ni la porte humaine.
- **FR-064** — L'application est rendue dans un cadre isolé, d'origine opaque. Ce cadre ne contient **aucun code écrit par les agents** : seulement un balisage assaini et des attributs déclaratifs qui désignent les comportements à appeler, plus un pont fixe fourni par le produit.
- **FR-065** — Toute la logique de l'application vit dans des composants du runtime, remplaçables à chaud. Le cadre ne calcule rien : il ne le peut pas.
- **FR-066** — Un agent peut remplacer un comportement vivant par une nouvelle version pendant que l'application sert. Le remplacement **ne recharge pas le cadre** — un rechargement serait un redémarrage, c'est-à-dire exactement ce que le produit prétend éviter.
- **FR-067** — Un remplacement qui échoue — code qui ne compile pas, composant qui tombe en erreur — restaure la version précédente **et les composants qu'elle avait chargés**. L'application continue de servir sans interruption et le refus est dit à l'écran.
- **FR-068** — Un créneau dont le comportement n'existe pas encore est visiblement inerte et annoncé comme tel. Il s'active dès qu'un agent le publie et s'éteint si le composant disparaît. C'est la dépendance réactive rendue lisible par quelqu'un qui ignore ce qu'est une dépendance.
- **FR-069** — L'état de l'application — journal des interactions du visiteur, entrée, sortie, version qui a répondu — vit hors du cadre et hors des composants remplaçables. **Aucun remplacement ne le perd.**
- **FR-070** — L'écran affiche en permanence ce que le remplacement à chaud a évité : nombre de remplacements, nombre de redémarrages, nombre d'interactions conservées.
- **FR-071** — Le balisage produit par un agent est assaini avant affichage : liste blanche de balises, aucun élément de script, aucun attribut d'événement, aucune source externe.
- **FR-072** — Un comportement s'exécute dans un fil isolé, sans accès au document, au stockage local ni au réseau de la page. Un comportement qui dépasse son temps imparti est arrêté ; son créneau affiche l'incident et la version précédente reste en service.
- **FR-073** — Le premier écran utilisable apparaît en moins de 15 secondes après le lancement. Pendant l'attente, le raisonnement du maître s'affiche à mesure qu'il arrive — c'est du contenu réel, pas un artifice de patience.

### F14 — Lisibilité dans la stack agents 2026

*Ajoutée le 2026-08-21, après lecture de « The AI Agents Stack (2026 Edition) » (O'Reilly Radar) et un grief de Guillaume : le produit sert de vitrine en entretien et n'emprunte rien au vocabulaire que l'interlocuteur reconnaîtra.*

L'arbitrage est posé et ne se rediscute pas : **aucun framework d'orchestration**. L'article le recommande lui-même — « la plupart des équipes prennent trop de framework » — et un graphe compilé avant l'exécution est incompatible avec la promesse du produit. Ce qui est adopté, ce sont les couches qui sont de vrais standards et qui manquent réellement.

- **FR-079** — Le vocabulaire d'actions est exprimé dans le **schéma d'outils commun** de l'écosystème, et demandé au fournisseur comme un appel d'outil plutôt que découpé dans du texte libre. Le schéma est la définition unique du vocabulaire ; la validation côté client en découle. Le découpage manuel reste le repli pour un fournisseur qui ne sait pas contraindre, et le mode employé est visible.
- **FR-080** — Le taux de réponses non conformes est **compté** et affiché avec les autres compteurs : une mesure, pas une surprise.
- **FR-081** — Un run produit une **trace OpenTelemetry** : un span par tour d'agent, par appel au fournisseur et par remplacement à chaud, avec la filiation réelle. Sans collecteur configuré, rien n'est émis et rien ne casse.
- **FR-082** — Un **harnais d'évaluation** rejoue un jeu de briefs enregistrés et rapporte : part de runs produisant une application utilisable, part comportant au moins un remplacement réussi (M7), délai jusqu'au premier écran, coût moyen. Il tourne sans fournisseur sur les runs déjà enregistrés.
- **FR-083** — Une page publique situe l'usine dans les couches de la stack : ce qu'elle emprunte, ce qu'elle a écrit, et pourquoi. Elle assume l'absence de framework d'orchestration en donnant sa raison ; elle nomme le fil isolé comme la couche de bac à sable que l'exécution d'outil réclame ; et elle dit ce que l'usine **ne fait pas** — pas de persistance, pas d'API d'agents, pas de multi-locataire, les agents ne survivent pas à l'onglet.

### F13 — Sources réelles, emport et rejeu (cycle A′)

- **FR-074** — Un agent peut brancher un comportement sur une source de données réelle, choisie dans une **liste blanche tenue côté serveur**. Aucun domaine proposé par le modèle n'est appelé.
- **FR-075** — Le visiteur peut emporter l'application produite : un fichier autonome qui s'ouvre hors ligne, portant le balisage, les comportements et le pont.
- **FR-076** — Un run peut être exporté depuis son flux d'événements et rejoué à l'identique, sans modèle et sans réseau. Le rejeu est partageable par lien.
- **FR-077** — Un run rejoué le dit clairement, à tout instant, et n'est jamais présenté comme un run en direct.

---

## 8. Exigences non fonctionnelles

### Performance et réactivité

- **NFR-001** — Premier signe de vie après lancement : < 1,5 s.
- **NFR-002** — Le graphe reste fluide (≥ 50 images par seconde `[ASSUMPTION]`) jusqu'à 40 nœuds vivants sur un portable de milieu de gamme.
- **NFR-003** — **Caduc au 2026-08-21** (plus de vérificateur). Remplacé : un comportement écrit par un agent rend sa réponse en moins de 300 ms sur une entrée de 2000 caractères, au-delà de quoi il est arrêté (FR-072).
- **NFR-030** — Le premier écran utilisable en moins de 15 s (FR-073), et le premier mot de raisonnement affiché en moins de 5 s.
- **NFR-004** — Aucun blocage du fil principal supérieur à 100 ms pendant un run.

### Frugalité et coût

- **NFR-005** — **Caduc au 2026-08-21.** Le mode nominal appelle un modèle. Ce qui subsiste : le mode **rejeu** n'émet aucune requête vers un fournisseur, et c'est lui qui absorbe le trafic hors capacité.
- **NFR-006** — **Caduc au 2026-08-21.** Il y a un coût variable par visiteur. Ce qui le remplace, et qui est une exigence plus dure : **ce coût est borné par visiteur et par jour**, et le produit reste utilisable une fois la borne atteinte (NFR-025, NFR-026).
- **NFR-007** — Poids du bundle initial : cible < 500 ko gzip `[ASSUMPTION]`.

### Sécurité et confidentialité

- **NFR-008** — Aucun secret n'est embarqué dans le bundle.
- **NFR-023** — *Amendé au 2026-08-21.* L'arbitrage annoncé a été posé : `script-src` autorise `'unsafe-eval'`, parce que sans évaluation réelle les agents ne peuvent qu'assembler un vocabulaire clos. Ce que la politique tient malgré tout : aucune source de script externe, aucune origine réseau hors relais, `object-src` et `base-uri` fermés. Le cadre de l'application (FR-064) est servi par sa propre page, sous sa propre politique, et **n'exige aucun assouplissement supplémentaire** — `frame-src` passe de `'none'` à `'self'`, et rien d'autre ne bouge.
- **NFR-024** — Le code écrit par un modèle ne s'exécute **jamais** dans le contexte de la page hôte : ni le document, ni le stockage local, ni la route du relais ne lui sont accessibles (FR-072). Cette exigence conditionne l'ouverture du partage de run : sans elle, un lien de rejeu serait un vecteur d'exécution chez le destinataire.
- **NFR-025** — Le relais applique un **budget par visiteur** en plus du plafond global. Un visiteur ne peut pas épuiser la capacité du jour. Le budget restant est affiché avant le lancement (FR-078).
- **NFR-026** — Capacité épuisée, crédit à zéro ou relais muet : le site bascule sur le rejeu en l'annonçant. Jamais une page morte, jamais une erreur brute.
- **NFR-027** — Le mode rejeu est couvert par des tests au même titre que le run en direct : il sera l'expérience majoritaire.
- **NFR-009** — **Restreint au 2026-08-21.** Le brief part chez le fournisseur dès le premier appel : la garantie d'origine ne tient plus pour lui. Ce qui tient : **les entrées que le visiteur soumet à l'application produite ne quittent jamais son navigateur** — les comportements s'exécutent en local, et en cycle A′ seule la source branchée est appelée, jamais l'entrée brute.
- **NFR-010** — L'utilisateur est informé, **avant le premier appel et sans interaction pour le découvrir**, que son brief part chez le fournisseur. Cette information n'est plus conditionnelle à un mode : elle est permanente.
- **NFR-028** — Le relais journalise ce qui rend le produit pilotable — horodatage, longueur du brief, nombre d'agents, application produite ou non, durée, cause d'échec — **sans conserver le texte saisi**. La conservation des briefs est une question ouverte (Q13), pas un défaut silencieux.
- **NFR-011** — La page compte quatre événements agrégés et rien d'autre : lancement d'un run, **apparition du premier écran utilisable**, **première soumission à l'application**, arrivée à la porte humaine. Sans cookie, sans identifiant persistant, sans tiers publicitaire, sans donnée personnelle, et sans jamais transmettre le contenu saisi par l'utilisateur. C'est le minimum qui rend M1, M2 et C2 observables ; au-delà, c'est du suivi et c'est refusé.

### Vérité, déterminisme et audit

- **NFR-012** — *Amendé au 2026-08-21 :* toute réponse de l'application indique **quelle version de quel comportement** l'a produite, et ce comportement est consultable dans son code (FR-058).
- **NFR-013** — Tout ce qui s'affiche indique son origine : écrit par un agent pendant ce run, rejoué depuis un run enregistré, ou tiré d'une source branchée (FR-074). Rien ne s'affiche sans que le visiteur puisse savoir d'où ça vient.
- **NFR-014** — Un run produit un journal consultable de ce qui a été décidé et par qui (agent ou humain).

### Accessibilité et compatibilité

- **NFR-015** — Contrastes conformes au niveau AA sur l'ensemble des textes et des états de nœuds.
- **NFR-016** — Le parcours critique (lancer, utiliser l'application produite, emporter) est accessible au clavier. L'application étant écrite par un modèle, le pont (FR-064) porte lui-même les rôles et les libellés accessibles : l'accessibilité ne peut pas dépendre de ce que le modèle a bien voulu écrire.
- **NFR-017** — L'état d'un nœud n'est jamais signalé par la seule couleur.
- **NFR-018** — Les animations respectent `prefers-reduced-motion` : le run reste compréhensible sans mouvement.
- **NFR-019** — `[ASSUMPTION]` Navigateurs cibles : deux dernières versions majeures de Chrome, Firefox, Safari et Edge.

### Qualité et maintenabilité

- **NFR-020** — TypeScript strict, sans `any` implicite, sur l'ensemble du code produit.
- **NFR-021** — La correspondance entre fibers vivantes et nœuds affichés est couverte par un test automatisé (contre-métrique C3).
- **NFR-022** — Le comportement de réversibilité (spawn, kill, cascade, réactivation) est couvert par des tests.
- **NFR-031** — L'observabilité ne conditionne rien : sans collecteur, le produit fonctionne à l'identique. Une trace absente est une trace absente, jamais un run dégradé.
- **NFR-032** — Le harnais d'évaluation est reproductible : deux exécutions sur le même jeu de runs enregistrés donnent le même rapport.
- **NFR-029** — Le remplacement à chaud est couvert par des tests sur ses trois promesses : la nouvelle version prend la main sans rechargement, une version fautive rend la main à la précédente **avec ses enfants**, et l'état du visiteur survit aux deux.

---

## 9. Doctrine de vérité (héritée de sku-regulator)

Cette doctrine n'est pas une préférence de style : elle est ce qui rend le produit défendable devant une personne du métier.

- Le modèle propose, l'humain et le code déterministe disposent.
- Le LLM est contraint aux données réelles ; il ne produit jamais une source qu'il n'a pas lue.
- Tout verdict incertain remonte à l'humain plutôt que d'être tranché.
- La sortie est déterministe et accompagnée de sa trace.

Elle se re-consomme d'un secteur à l'autre : on change la source de vérité et l'expert qui signe.

*Amendé au 2026-08-21 :* sans scénario ni corpus imposé, la doctrine ne porte plus sur des verdicts réglementaires. Elle porte désormais sur deux choses, et elle y porte pleinement : **ce que l'application affiche** (NFR-012, NFR-013 — origine et version toujours dicibles) et **ce qu'une source branchée en cycle A′ permet d'affirmer** (FR-074). Le corpus réglementaire statique hérité de `sku-regulator` n'a plus de consommateur ; sa suppression ou sa réaffectation en mémoire de run est portée par le chantier « mémoire de run » (§12).

---

## 10. Design

Le design est produit dans Claude Design et non ici. Le PRD s'engage uniquement sur ce qui est contractuel pour l'ingénierie.

### Le ton (contractuel)

**Éditorial, aéré, confiant, précis. Comme un studio qui montre une machine impressionnante sans esbroufe.**

*Amendé au 2026-08-21 :* le wahou vient d'une application qui apparaît en quelques secondes et **se refait sous les doigts du visiteur sans rien perdre** — jamais d'effets décoratifs. Le graphe qui pousse est la preuve, pas le spectacle. Toute animation exprime un événement réel du moteur (contre-métrique C6). Une interface qui ferait joli sans rien dire du système échoue à cette exigence, même si elle est belle.

### La progression de l'écran (contractuel, ajouté au 2026-08-21)

**Rien n'est là d'avance. Chaque élément d'interface doit être payé par un événement réel du run.** Pas de squelette, pas de barre de progression, pas de cadre de graphe vide en attente : ce sont exactement les artifices que le produit prétend remplacer. Ce qui occupe l'attente est du contenu vrai qui arrive.

| état | ce qui est à l'écran |
|---|---|
| au repos | le champ de brief, vide, et trois exemples qui écrivent dedans (FR-001). Rien d'autre. |
| amorçage | le champ devient l'en-tête ; le raisonnement du maître s'affiche à mesure qu'il arrive (FR-073) |
| premier écran | l'application apparaît et prend le centre, créneaux inertes annoncés comme tels (FR-063, FR-068) |
| en vie | les comportements s'allument un par un ; **le graphe apparaît seulement ici**, réduit à une ligne de résumé qui se déplie |
| porte | emporter ou écarter, avec ce que chacun coûte (FR-031, FR-032) |
| emporté | le fichier, le lien de rejeu, la suite |

**L'arbitrage entre le graphe et l'application est tranché : l'application est le protagoniste, le graphe est la preuve.** Ils ne sont pas à parité. Un graphe fascine vingt secondes ; une application s'utilise. Le graphe est donc réduit par défaut à sa ligne de résumé — *« 8 agents · 3 remplacements à chaud · 0 redémarrage »* — et se déplie à la demande.

**Les états d'échec sont des états normaux**, pas des exceptions : ils seront majoritaires tant que la capacité est ce qu'elle est. Relais muet, capacité épuisée, crédit à zéro, modèle illisible, aucune application produite, comportement qui lève ou qui boucle — chacun a son écran, dit ce qui s'est passé, et propose la suite (NFR-026).

**Sur écran étroit** : une colonne, l'application d'abord, le graphe replié à sa ligne, le journal dépliable.

**Le mouvement** : la seule animation est l'arrivée. Rien ne pulse pour faire vivant — le vivant, c'est le contenu.

### Les invariants visuels

- Design system Memo Labs conservé : crème `#faf9f7`, encre `#16130f`, terracotta `#ad4c16`, Oswald, coins carrés, thème clair unique, fond peint explicitement.
- **Application plein écran, 100vh, sans défilement éditorial** : conversation et brief à gauche, panneau vivant à droite. Pas de hero, pas de sections, pas de page qui scrolle.
- Un seul niveau d'accent. Un seul foyer visuel — *amendé au 2026-08-21 :* **l'application**, pas le graphe.
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
| R4 | ~~Le vérificateur d'allégations rend un verdict faux avec une source réelle~~ | — | **Sans objet au 2026-08-21** : plus de vérificateur. Le risque équivalent réapparaîtra au cycle A′ avec les sources branchées, et sera traité alors. |
| R5 | Le run est spectaculaire mais trop long | Abandon en cours de route (C2) | Cible 60-120 s, possibilité d'accélérer ou de sauter |
| R6 | Le projet dérive et cesse de servir l'objectif numéro un (le CDI) | Coût d'opportunité | Chaque phase se termine par une porte livrable et montrable |
| R7 | La génération de composant à l'exécution (FR-052) reste anecdotique : on fabrique un composant trivial et on appelle ça une usine | Touche la promesse centrale | Le mécanisme est prouvé (spike, 4c et 4d) ; le risque s'est déplacé de « est-ce faisable » vers « est-ce substantiel ». Q9 doit dire ce qui est fabriqué, et la réponse doit être défendable devant Marc (UJ-2) |
| R8 | La sobriété du design finit par tuer le spectacle (O6 sacrifié à la retenue) | Le run n'impressionne plus personne | Le ton contractuel de §10 tranche : impressionner par ce qui se passe. C2 et C6 se surveillent ensemble, jamais l'une contre l'autre |
| R9 | Le premier écran met trop longtemps à venir | Le visiteur part avant que le produit existe ; tout le reste devient sans objet | FR-073 (15 s), chemin court au premier tour, raisonnement affiché pendant l'attente |
| R10 | La capacité du jour est épuisée par quelques visiteurs et le site n'a plus rien à montrer | L'expérience majoritaire devient un échec | NFR-025 (budget par visiteur), NFR-026 et NFR-027 (le rejeu tenu au niveau du direct) |
| R11 | Les agents améliorent peu ou pas : ils écrivent une version et s'arrêtent, donc aucun remplacement à chaud n'a lieu | La démonstration centrale ne se produit pas ; on retombe sur « un générateur de code de plus » | Budgets de tours revus, observation renvoyée à l'agent tant que l'application est incomplète, et **mesure** : proportion de runs comportant au moins un remplacement réussi |
| R12 | Un brief hostile fait écrire du code malveillant, et le partage de run le livre à un tiers | Atteinte réelle à un visiteur, et au produit | NFR-024 (fil isolé, aucun accès à la page hôte) — condition préalable à l'ouverture du partage (FR-076), pas un correctif ultérieur |

---

## 12. Phasage

Les quatre phases d'origine sont closes ou caduques : la v1 est en ligne depuis le 2026-08-20, mais sur une architecture qui a changé en route (§5). Le phasage ci-dessous repart de ce qui est déployé.

- **Phase 0 — Fondations.** ✅ **Close le 2026-08-20.** Faisabilité navigateur de Cordis, coeffect réactif, cascade, réversion, génération de composant à l'exécution.
- **Phases 1 à 4 d'origine.** Partiellement livrées, partiellement caduques : le run réel, le graphe, la narration et la porte sont en ligne ; le payoff scénarisé et la seconde niche sont abandonnés (F6, F9).
- **Cycle A — L'application vivante.** Cadre isolé et pont, action de remplacement, état hors des composants remplaçables, fil isolé pour les comportements, budget par visiteur, chemin court vers le premier écran, mode rejeu. *Porte : un tiers écrit un brief, obtient une application en moins de 15 s, s'en sert, et voit au moins un remplacement à chaud se produire sans rien perdre.*
- **Cycle A′ — Valeur réelle et emport.** Sources sur liste blanche, action de branchement, emport de l'application, export et rejeu partageable d'un run. *Porte : l'application produite affiche une donnée qui ne vient pas du texte tapé par le visiteur, et il repart avec le fichier.*
- **Cycle B — La panne et la reprise.** Vérification par cas exécutés, désactivation en cascade visible avec sa cause, réparation par un agent, réactivation. *Porte : un run où quelque chose casse, se voit casser, et se répare — c'est la seconde dimension du paradigme, la seule encore non démontrée.*
- **Chantier mémoire de run.** Généralisation du corpus statique en mémoire alimentée par les agents ; sort du corpus réglementaire tranché ici. Peut voyager avec le cycle B.
- **Chantier compétences.** Bibliothèque persistée d'un run à l'autre : un composant écrit par un run est proposé au suivant, chargé à chaud, relâché s'il ne sert pas. L'usine s'améliore d'un visiteur à l'autre.
- **Chantier « agents comme service ».** Persistance des agents, API REST, multi-locataire — le sommet de la carte Letta. **Hors périmètre, et pour une raison de fond** : ce produit démontre une composition qui vit dans l'onglet du visiteur ; déplacer le run côté serveur ferait regarder une vidéo de la chose au lieu de la chose. Si ce besoin devient réel, c'est un autre produit, pas une extension de celui-ci.
- **Chantier MCP.** Outillage découvert à l'exécution via le relais, réutilisant la route sortante du cycle A′. Placé après A′ : fait avant, c'est un protocole entier pour aucune capacité nouvelle. *Note du 2026-08-21 :* c'est aussi le nom le plus reconnaissable de la stack 2026 — « MCP won » — donc son intérêt n'est plus seulement technique.
- **Epic 9 — Alignement sur la stack.** Sortie contrainte, trace OpenTelemetry, harnais d'évaluation, page de situation. Peut s'intercaler dès la fin du cycle A : FR-079 corrige une faiblesse mesurée en production, et FR-082 est ce qui dira si les cycles suivants améliorent quoi que ce soit.

L'ordre n'est pas négociable sur un point : **le remplacement à chaud vient avant tout le reste.** Le papier qui fonde le paradigme qualifie lui-même les outils synthétisés par un modèle de « précurseur étroit » de l'auto-modification au niveau composant ; empiler des capacités sur un système qui ne se modifie pas revient à rester dans le précurseur.

---

## 13. Questions ouvertes

Aucune de ces questions ne rend le PRD inexploitable en aval — elles sont portées par la phase nommée en dernière colonne. Q2, Q9 et Q10 sont le travail de `bmad-architecture`. Q3 se referme en lisant `src/usine/run.ts`. Q4 et Q5 appellent une décision de Guillaume au moment de la phase concernée. Q8 est un arbitrage de cible, révisable après la première mise en ligne.

| # | Question | Porté par |
|---|---|---|
| ~~Q1~~ | ~~Cordis tourne-t-il dans le bundle navigateur ?~~ **Close le 2026-08-20 : oui, client-only, aucun repli.** | — |
| ~~Q2~~ | ~~Que fait chaque agent en mode déterministe ?~~ **Close le 2026-08-20 : sans objet, il n'y a plus de comportement d'agent écrit à la main.** | — |
| ~~Q3~~ | ~~Quel est le second scénario de niche ?~~ **Close le 2026-08-20 : plus de scénarios.** | — |
| ~~Q4~~ | ~~Quelle est la source de vérité du vérificateur ?~~ **Close le 2026-08-21 : plus de vérificateur.** Reformulée en Q12 pour le cycle A′. | — |
| ~~Q5~~ | ~~Quel fournisseur de LLM ?~~ **Close le 2026-08-20 : OpenRouter, `deepseek/deepseek-v4-flash`, clé côté serveur.** | — |
| Q11 | Que propose la sortie d'un run réussi, au-delà de l'emport et du lien de rejeu ? C'est la pièce phare de Memo Labs et un `mailto:` est une fin de parcours faible. | Cycle A′ |
| Q12 | Quelles sources entrent dans la liste blanche du cycle A′, et sur quel critère ? Une liste molle transforme le relais en proxy ouvert sur un site public. | Cycle A′ |
| Q13 | Conserve-t-on le texte des briefs ? C'est la donnée produit la plus précieuse et c'est du contenu utilisateur. Défaut actuel : non conservé (NFR-028). | Cycle A, avant mise en charge |
| Q14 | Le produit reste-t-il unilingue français ? Décision à prendre consciemment plutôt que par défaut. | Après le cycle A′ |
| Q15 | Que devient le corpus réglementaire statique : supprimé, ou réaffecté en mémoire de run ? | Chantier mémoire de run |
| Q8 | Les cibles chiffrées marquées `[ASSUMPTION]` (M1, M2, NFR-002, NFR-007) sont-elles les bonnes ? | Validation du PRD |
| ~~Q9~~ | ~~Quel composant l'usine fabrique-t-elle à l'exécution ?~~ **Close le 2026-08-21 : l'application elle-même — son écran et ses comportements — puis ses versions successives (F12).** | — |
| ~~Q10~~ | ~~La mémoire de run est-elle écrite à la main par scénario ?~~ **Sans objet : plus de scénarios.** Reformulée dans le chantier mémoire de run. | — |

---

## Glossaire

- **Composant** — unité chargeable du runtime Cordis, produisant une fiber. Un agent ou un outil en est un.
- **Spawner** — charger un composant dans le runtime depuis un autre composant, ce qui crée une fiber enfant dont la libération suit celle du parent.
- **Composant généré** — composant qui n'existait pas avant le run, fabriqué à l'exécution par un agent à partir d'une spécification, puis chargé à chaud (FR-052).
- **Fiber** — instance vivante d'un composant chargé, disposable, dont la libération annule ses effets.
- **Coeffect** — dépendance déclarée (`inject`) ou capacité exposée (`provide`) par un composant ; c'est ce qui forme les arêtes du graphe.
- **Artefact** — document produit par un agent pendant le run et consultable par l'utilisateur : découpage en histoires, spécification, décision d'architecture (F10).
- **Mémoire de run** — ce que l'agent maître sait du secteur visé et ce qui a été décidé depuis le début du run ; consultable, et référencée par les agents en aval (FR-055).
- **Porte humaine** — point d'arrêt du run où une décision humaine est requise. Depuis le 2026-08-21, elle statue sur une application déjà en service : emporter ou écarter.
- **Application vivante** — le produit d'un run : un écran et des comportements, servis pendant que le run continue (F12).
- **Écran** — le balisage de l'application, écrit par un agent, assaini, rendu dans le cadre isolé. Il ne calcule rien.
- **Comportement** — une unité de logique de l'application, écrite par un agent, chargée comme composant, appelée depuis l'écran, remplaçable à chaud.
- **Pont** — le code fixe que nous fournissons dans le cadre isolé : il lit les attributs déclaratifs de l'écran, transmet les demandes aux comportements et affiche les réponses.
- **Créneau** — l'endroit de l'écran qui appelle un comportement nommé. Inerte tant que le comportement n'existe pas, actif dès qu'il est publié (FR-068).
- **Remplacement à chaud** — substitution d'une version d'un composant par une autre pendant que le système sert, sans redémarrage et sans perte d'état. Retour arrière garanti si la nouvelle version échoue (FR-066, FR-067).
- **Rejeu** — réexécution à l'identique d'un run enregistré, depuis son flux d'événements, sans modèle ni réseau (FR-076).
- **Casting** — *terme retiré au 2026-08-20.* Il désignait un ensemble d'agents connu avant le brief, ce que le produit refuse.
- **Scénario** — *terme retiré au 2026-08-21.* Il désignait un run défini en données, donc un graphe connu d'avance.
- **Payoff** — *terme retiré au 2026-08-21.* Il supposait que le produit arrive à la fin ; il arrive maintenant au début.
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
| ~~§5, mode LLM~~ | ~~La clé reste en mémoire de session.~~ **Close le 2026-08-20 : la clé est au serveur, le client n'en voit jamais aucune.** |
| §7, FR-023 | Le zoom du graphe est borné. |
| ~~§7, FR-041~~ | ~~Un lien de contact suffit comme point de sortie.~~ **Rejetée le 2026-08-21, devenue Q11.** |
| §7, FR-073 | Le premier écran en moins de 15 s est atteignable avec deux appels de modèle enchaînés sur DeepSeek V4 Flash. À mesurer dès le premier jet du cycle A ; si la cible est manquée, c'est le chemin court qu'il faut revoir, pas l'exigence. |
| §8, NFR-025 | Un budget de deux runs par visiteur et par jour est le bon réglage. À réviser après la première mise en charge. |
| §8, NFR-002 | Cible de fluidité à 50 images par seconde jusqu'à 40 nœuds. |
| §8, NFR-007 | Cible de bundle initial sous 500 ko gzip. |
| §8, NFR-019 | Navigateurs cibles : deux dernières versions majeures de Chrome, Firefox, Safari, Edge. |
