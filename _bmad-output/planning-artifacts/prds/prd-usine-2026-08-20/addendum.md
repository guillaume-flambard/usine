# Addendum — L'usine agentique

Profondeur technique et rationnels sortis du PRD parce qu'ils appartiennent à l'architecture ou à la conception de solution, pas au PRD lui-même. À consommer par `bmad-architecture` et `bmad-ux`.

## Mécanisme retenu : Cordis comme noyau de composition

`@cordisjs` est le moteur validé le 2026-08-20 (Node v24, 3 paquets, ~2 s d'installation). L'API réelle correspond au papier : `ctx.plugin / effect / set / get / inject`, exports `Fiber / FiberState / Inject / Service`.

Preuve exécutée : un composant ouvre une ressource via `ctx.effect(() => { …; return () => …undo… })` ; `fiber.dispose()` la referme automatiquement, en ordre inverse. Spawn et kill à chaud avec réversion propre sont donc acquis. Fichiers : `scratchpad/cordis-test/demoA.mjs`.

Le coeffect réactif, noté « reste à câbler » dans `docs/2-EXECUTION.md`, est **prouvé depuis le 2026-08-20** : les métadonnées `provide` / `inject` du plugin suffisent. L'agent attend en `PENDING`, s'active seul à l'arrivée de sa dépendance, se désactive seul à son départ, se réactive à son retour. Voir `spike-cordis-navigateur.md`.

Contrat de composant visé :
- `inject` — ce dont le composant a besoin ; il ne s'active que lorsque tout est fourni.
- `provide` — ce qu'il expose (un outil, une capacité, un résultat).
- `apply` — ce qu'il installe au chargement, et son inverse au déchargement.

Conséquences directes : l'agent maître spawn via `ctx.plugin(component)` et obtient une fiber ; le décharger cascade sur tout ce qu'il a créé ; la topologie de coeffects *est* le graphe affiché ; HMR permet le remplacement à chaud d'un composant généré, donc le rollback propre d'une auto-modification ratée.

Versions : `cordis@4.0.0-rc.8` est installé dans le projet et vérifié. `@cordisjs/loader` et `@cordisjs/plugin-hmr`, relevés dans `docs/2-EXECUTION.md`, ne sont ni installés ni testés — le HMR reste à prouver. `cordis` est en release candidate et peut bouger.

## Question de transport — close, puis rouverte autrement

Cordis se bundle sous Vite et tourne dans le navigateur. Mesuré le 2026-08-20 dans Chrome : treize vérifications sur treize, aucune API native de Node dans le bundle, 11,4 ko gzip. Le **moteur de composition** reste client-only, et c'est ce qui compte.

*Amendé au 2026-08-21.* Les deux replis alors écartés sont revenus, mais pour d'autres raisons que le transport :

- **Un service Node** existe : le relais de raisonnement, dans le même conteneur, joignable sur la boucle locale. Il n'a pas été ajouté pour faire tourner Cordis mais pour tenir la clé du fournisseur hors du client. L'hébergement n'est donc plus purement statique, ce qui rend NFR-006 caduc.
- **Un Web Worker** revient au cycle A, et pas non plus pour le moteur : pour **isoler le code écrit par le modèle**. Le moteur reste sur le fil principal ; ce sont les comportements générés qui partent dans le Worker, parce qu'ils voient sinon le DOM, le stockage local et la route du relais — et parce qu'une boucle infinie dans du code écrit par un modèle doit être arrêtable.

## Le pivot du 2026-08-21 : l'application vivante

**Le constat.** Le produit déployé fabriquait *une fonction pure* et ne la rendait qu'après la porte humaine. Trois conséquences mesurées sur le code : la seule forme de produit possible était `texte → valeur` (`runProduct` prend la première fonction publiée, l'écran de livraison l'appelle avec une chaîne) ; rien ne servait pendant le run, donc « se modifier en continuant de servir » — l'exemple motivant §1.2.2 du papier — n'arrivait jamais ; et `kernel.replace`, implémenté, verrouillé contre l'entrelacement et testé, **n'avait aucun appelant** parce que le vocabulaire des agents ne l'exposait pas. Le remplacement à chaud, contribution §5.2.2 du papier, était du code mort.

**La forme retenue : une application rendue dans un cadre isolé.** Trois options ont été posées à Guillaume, qui a tranché pour celle-ci :

| option | ce qu'elle donnait | pourquoi écartée |
|---|---|---|
| **cadre isolé** *(retenue)* | couvre n'importe quel brief, se regarde sans jargon, le visiteur repart avec un fichier | — |
| service à sessions | plus léger, la perte qu'un redémarrage causerait est littéralement l'exemple du papier | trop abstrait pour un visiteur non technique |
| pipeline de composants | démontre les deux dimensions d'un coup | très technique à regarder |

**Le mécanisme, et pourquoi il est contraint ainsi.** L'application se coupe en trois : un cadre isolé qui ne contient aucun code des agents ; des comportements qui vivent comme composants du runtime ; un état qui vit hors des deux. Le cadre reçoit un balisage assaini plus des attributs déclaratifs (`data-invoke`, `data-field`, `data-output`) et un pont fixe que nous fournissons.

Ce découpage n'est pas une précaution, c'est un choix d'architecture : **le cadre ne peut rien calculer**, donc toute la logique *doit* être des composants remplaçables à chaud. On ne peut pas tricher et rendre la démonstration décorative. Il a un second mérite : aucune politique de sécurité n'est assouplie — le cadre est servi par sa propre page sous sa propre politique, et seul `frame-src` passe de `'none'` à `'self'`.

**Ce que le rollback garantit déjà.** `performReplacement` relâche l'entrée, charge la remplaçante, et si elle échoue ou tombe en état d'erreur, la relâche, **restaure la précédente et recharge les composants qu'elle avait chargés**. La garantie de composabilité temporelle est donc réelle et testée avant même le cycle A ; il ne lui manquait qu'un appelant.

## Ordre des capacités, et pourquoi celui-là

L'inventaire du 2026-08-21 a fait apparaître quatre chantiers au-delà de A et A′ : vérification et reprise sur panne (B), mémoire de run, bibliothèque de compétences persistée, outillage MCP. L'ordre retenu est A, A′, B, mémoire, compétences, MCP. Les raisons, dans l'ordre où elles ont pesé :

- **Le papier lui-même hiérarchise.** Il qualifie les outils synthétisés par un modèle de « narrower precursor » de l'auto-modification au niveau composant. Notre `build` est ce précurseur ; `replace` est la chose elle-même. Empiler des capacités avant `replace`, c'est rester dans le précurseur en le décorant.
- **MCP réutilise la route sortante de A′.** Fait avant, c'est un protocole entier pour aucune capacité nouvelle ; fait après, c'est un ajout. Son mérite propre, une fois là : les outils sont **découverts à l'exécution**, donc le graphe se construit sur un outillage que personne n'avait déclaré.
- **Les compétences n'ont de sens qu'après A.** Une compétence utile n'est pas un outil renommé : c'est un composant qu'un run écrit et qu'un run suivant recharge à chaud, puis relâche proprement s'il ne sert pas. Avant que charger-remplacer-rétracter soit la mécanique centrale, il n'y a rien à mettre en bibliothèque.
- **Contrainte dure sur les trois derniers.** Le navigateur ne parle qu'à notre origine (`connect-src 'self'`) : pas de MCP direct — ni stdio, ni HTTP+SSE — et aucune clé côté client. Tout ce qui sort passe par le relais, sur liste blanche.

## La contrainte CSP, découverte par le spike

`new Function` échoue sous `Content-Security-Policy: default-src 'self'`. La fabrication de composant à l'exécution emprunte donc deux voies distinctes :

- **Par composition de primitives** — un compilateur prend une spécification et assemble des primitives existantes en un composant. Passe sous CSP stricte.
- **Par évaluation de code** — `new Function` sur une source produite à l'exécution. Exige `unsafe-eval`.

*Tranché le 2026-08-20 :* **la voie par évaluation est la seule retenue.** La composition de primitives enferme les agents dans un vocabulaire clos — rien d'imprévu ne peut en sortir, et c'est précisément ce que le produit promet. La CSP déployée porte donc `script-src 'self' 'unsafe-eval'`, et l'isolement est reporté là où il est efficace : le fil d'exécution des comportements (cycle A). La voie par composition n'est pas conservée derrière une interface commune — la garder coûterait une abstraction que rien n'appelle.

## Conflit de stack tranché

`docs/2-EXECUTION.md` décrit un front Next.js / React / Tailwind. `docs/0-DECISIONS.md` décrit Vue 3 + TypeScript + Vite, et déclare primer sur les autres documents. Le dépôt est effectivement scaffoldé en Vue via `create-vue`, avec pnpm, ESLint/oxlint, Prettier et TypeScript strict.

Décision : **Vue 3 + Vite**. `docs/2-EXECUTION.md` est périmé sur ce point et devrait être corrigé pour éviter que l'erreur ne se propage.

## Ce qui est repris de l'existant

`src/usine/run.ts` (1252 lignes) est un run choréographié par timers, porté depuis un artefact Open Design. Il est abandonné comme moteur, mais il contient trois choses à récupérer :

1. **La géométrie et le vocabulaire du graphe** — définitions de nœuds avec position, libellé, technologie, rôle, et le tracé d'arêtes courbes. Réutilisable comme base de la disposition automatique.
2. ~~**Le moteur de règles du vérificateur d'allégations.**~~ *Abandonné au 2026-08-21 :* plus de vérificateur, plus de scénario. Le corpus statique qui en descend est tenu pour poids mort ; son sort est porté par le chantier mémoire de run (Q15).
3. ~~**Les trois scénarios déjà écrits**~~ (`ClaimCheck`, `Pulse`, `Tandem`). *Abandonnés au 2026-08-20* avec la notion même de scénario.

`src/assets/usine.css` (1318 lignes) porte le design system et se conserve.

## Alternatives écartées

- **Écrire notre propre runtime de composition.** Écarté : Cordis est prouvé, et le réécrire consommerait tout le budget sans rien prouver de plus. Garde-fou explicite dans la vision.
- ~~**Run entièrement piloté par LLM par défaut.**~~ **Retourné le 2026-08-20 : c'est désormais le mode nominal.** Le rationnel d'origine — coût par visiteur, latence, non-déterminisme, dépendance à une clé — était juste sur les faits et faux sur la conclusion : sans modèle, le graphe est connu d'avance, et c'est un défaut plus grave que tous les autres réunis. Les quatre objections sont traitées une par une plutôt que par abstention : la clé vit au serveur, le coût est borné par visiteur, la latence a une exigence chiffrée (FR-073), et le non-déterminisme est absorbé par le rejeu d'un run enregistré (FR-076), qui rend au passage la démonstration reproductible en entretien.
- **Rester sur le run scripté et l'assumer comme théâtre.** Écarté par `docs/0-DECISIONS.md` : la version théâtrale est explicitement jetée au profit d'un vrai moteur. La vision antérieure prévoyait un milieu simulé avec un payoff réel ; la décision du 2026-08-20 remonte l'exigence de réalité au moteur lui-même.
- **Thème sombre ou multi-thème.** Écarté : le design system Memo Labs est clair, un seul thème assumé.

## Profondeur produit non retenue dans le PRD

- **Monétisation.** Stripe plus metering, réutilisant PayKit. Hors v1, mais l'architecture ne doit pas rendre l'ajout coûteux.
- **Données et niche réelle.** PostgreSQL avec pgvector et recherche hybride, registre EU comme source de vérité pour les compléments, dans la perspective d'une version serveur d'une niche. Sans objet pour la v1 client-only, structurant pour la suite.
- **Infrastructure.** Docker (node22 vers nginx, pnpm), VPS Netcup sous `/opt/projects`, domaine dédié, entrée dans `lab-hub/public/projects.json`. Chaque application Memo Labs a son dépôt et son sous-domaine.
- **Positionnement.** Le flagship et la première démo de niche sont le même run — choix explicite. Les niches suivantes réutilisent le moteur en changeant la source de vérité et l'expert qui signe.

## Inventaire du 2026-08-21 — ce que le plan ne couvrait pas

Passe faite à la demande de Guillaume avant d'engager le cycle A. Les points entrés dans le périmètre sont devenus des exigences (FR-072 à FR-078, NFR-024 à NFR-030) ; ceux-ci sont conservés pour mémoire avec leur traitement.

| point | traitement |
|---|---|
| Le plafond de capacité était **global** : ~45 appels par run contre 400 par jour, soit ~8 runs pour le site entier, épuisables par un seul visiteur | NFR-025, budget par visiteur ; NFR-026, repli par rejeu |
| Le repli devenait de fait l'expérience majoritaire sans être tenu comme un produit | NFR-027, tests au même niveau que le direct |
| Les comportements écrits par le modèle tournaient dans la page hôte, avec accès au document, au stockage local et à la route du relais | FR-072 et NFR-024, fil isolé — **condition préalable** à l'ouverture du partage de run, pas un correctif ultérieur |
| Le visiteur ne repartait avec rien | FR-075, emport d'un fichier autonome |
| Le flux d'événements est sérialisable et personne ne s'en servait | FR-076, export et rejeu partageable : preuve d'authenticité, actif de démonstration et corpus de test d'un seul coup |
| Le délai jusqu'au premier écran n'était nulle part | FR-073, 15 s, avec le raisonnement affiché pendant l'attente |
| La porte détruisait ce que le visiteur utilisait, sans le dire | FR-031 et FR-032 amendés |
| Aucune observabilité : ni brief, ni cause d'échec, ni durée | NFR-028, journal minimal sans contenu saisi ; conservation des briefs ouverte en Q13 |
| Rien de prévu au crédit épuisé | NFR-026 |
| Corpus réglementaire sans consommateur | Q15 |
| Produit unilingue par défaut plutôt que par décision | Q14 |
| Sortie limitée à un `mailto:` sur la pièce phare | Q11 |
| Graphe et application se disputant l'écran | tranché au §10 du PRD : l'application est le protagoniste |
| Mobile non traité pour la nouvelle mise en page | §10, une colonne, graphe replié |
