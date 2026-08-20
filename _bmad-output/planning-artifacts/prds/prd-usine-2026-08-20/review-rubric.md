# PRD Quality Review — L'usine agentique

Marcheur de rubrique, exécuté en séquentiel (sous-agents non autorisés sur ce run). Enjeux retenus : lancement public, PRD en tête de chaîne (alimente UX, architecture, épics).

## Verdict global

Le PRD est structurellement solide et intellectuellement honnête là où ça compte : la section 5 nomme frontalement l'endroit où ce genre de document ment d'habitude, et les parcours portent de vraies décisions plutôt que du décor. Deux choses le rendent inexploitable tel quel : **trois métriques de succès sur six sont impossibles à mesurer sous ses propres contraintes**, et **l'exigence de casting (FR-056) entre en collision directe avec le principe anti-décor (FR-016)** — telle qu'écrite, elle autorise exactement ce que le produit prétend refuser. La clarté du « fini » est la dimension la plus faible : une douzaine d'exigences reposent sur des adjectifs invérifiables.

## Decision-readiness — adequate

Les décisions sont posées comme des décisions. La section 5 est le point fort du document : elle dit ce que le mode par défaut fait, ce qu'il ne fait pas, et exige que la limite soit affichée. La section 10 tranche un conflit entre deux documents sources au lieu de l'enjamber. Les alternatives écartées vivent dans l'addendum avec leur motif.

Ce qui affaiblit la dimension : la densité d'ouverts. Dix questions ouvertes et huit tags `[ASSUMPTION]` sur un PRD censé donner le feu vert à l'architecture, c'est beaucoup. Q1 (Cordis dans le navigateur) et Q9 (que fabrique-t-on exactement à l'exécution) ne sont pas des détails à trancher plus tard : la réponse à Q1 change l'architecture de fond en comble, et la réponse à Q9 détermine si la deuxième affirmation du résumé exécutif est tenable.

### Findings
- **high** Q1 et Q9 sont traitées comme des questions ouvertes ordinaires (§13) — Ce sont des bloqueurs de phase déguisés en items de liste. Q1 décide client-only contre Web Worker contre backend ; Q9 décide si la promesse centrale tient. *Fix :* les sortir du tableau, en faire une section « à trancher avant l'architecture », ou lancer le spike Q1 avant de figer le PRD.
- **medium** Densité d'ouverts élevée pour un PRD en tête de chaîne — 10 questions + 8 assumptions. *Fix :* trancher les cibles chiffrées (Q8) qui ne demandent qu'un arbitrage, pour ne laisser ouvert que ce qui demande vraiment une investigation.

## Substance over theater — strong

Trois parcours, trois protagonistes nommés, et chacun produit une décision différente dans le document : Camille impose l'absence de documentation et le payoff tapé par l'utilisateur, Marc impose l'introspection du runtime (FR-012), Sophie impose la citation de source et la porte de sortie (FR-041). Aucun n'est là pour faire nombre.

Les exigences non fonctionnelles sont majoritairement spécifiques au produit et chiffrées, pas du copier-coller. La contre-métrique C6 est un vrai garde-fou.

Une réserve : la section 2 affirme que « personne ne montre une composition d'agents qui se construit elle-même ». Aucune recherche n'a été menée pour l'étayer — c'est tracé dans le memlog comme un renoncement explicite, mais la phrase, elle, est écrite sans réserve.

### Findings
- **medium** Affirmation de différenciation non étayée (§2) — « Personne ne montre… » est une revendication de marché sans source. Sur un produit dont l'argument est l'honnêteté, une revendication invérifiable est un mauvais endroit où être approximatif. *Fix :* soit la vérifier (une passe sur n8n, Dust, LangGraph Studio, Flowise suffit), soit la reformuler en observation personnelle assumée.

## Strategic coherence — strong

Le PRD a une thèse et elle tient sur une ligne : la crédibilité se gagne en rendant le mécanisme observable, pas en le racontant. Tout en découle — l'introspection du runtime, la traçabilité des artefacts, l'exigence que le payoff soit tapé par le visiteur, le refus des effets décoratifs.

Le phasage suit la thèse plutôt que la facilité : la phase 0 est la question la plus risquée, pas la plus rapide. Les contre-métriques existent et mordent.

### Findings
- **low** M5 (« au moins 2 scénarios ») et Q3 se contredisent mollement — le PRD exige deux scénarios tout en laissant ouvert lequel, alors que trois existent déjà dans le code. *Fix :* trancher en lisant `run.ts`, la question se referme en dix minutes.

## Done-ness clarity — thin

C'est la dimension la plus faible, et c'est celle sur laquelle la création d'histoires va s'appuyer le plus fort.

Une part significative des exigences repose sur des adjectifs qu'aucun test ne peut vérifier. Un implémenteur de bonne foi peut livrer quelque chose de conforme à la lettre et manquer complètement l'intention.

### Findings
- **critical** FR-056 autorise le décor qu'FR-016 interdit — FR-056 exige « au moins trois agents constructeurs en parallèle affichant chacun sa technologie ». FR-016 exige « aucun nœud décoratif ». En mode client-only sans backend, un nœud « Builder DB · Postgres » n'a aucun Postgres derrière lui : c'est un nœud décoratif portant une étiquette de technologie. Les deux exigences ne peuvent pas être satisfaites ensemble telles qu'écrites. *Fix :* définir ce que chaque constructeur produit réellement dans le runtime de la page, et n'afficher une étiquette de technologie que si le composant fait quelque chose de vérifiable ; sinon renommer le casting pour qu'il décrive ce qui se passe vraiment.
- **high** Adjectifs invérifiables dans les exigences — FR-006 « discrète mais non dissimulée », FR-026 « calme et lisible », FR-033 « au moins une objection substantielle », FR-041 « point de sortie discret », FR-053 « consultable », FR-061 « lisibles par un humain non technique ». *Fix :* remplacer chacun par une conséquence observable (FR-033 : l'objection cite un élément précis de l'artefact attaqué ; FR-053 : le code source du composant généré et sa spécification sont affichables côte à côte ; etc.).
- **high** NFR-013 énonce une doctrine, pas une exigence testable — « aucun verdict produit par un LLM n'est présenté comme définitif sans passage par une règle déterministe ou une validation humaine » : rien n'indique comment on le constate. *Fix :* l'exprimer comme une propriété de l'interface (tout verdict affiche son origine : règle, ou LLM en attente de validation).
- **medium** FR-014 et FR-046 décrivent un repli sans dire ce que voit l'utilisateur — « signalé sans casser le run » ne dit pas où ni comment. *Fix :* rattacher au nœud et à la narration.

## Scope honesty — strong

La section 6 fait un vrai travail : elle sort explicitement les comptes, la persistance, la monétisation, le traitement par lot (qui est pourtant l'attente exprimée par Sophie en UJ-3, et le PRD le dit), la génération d'un dépôt livrable, et le multi-thème. Les renoncements sont datés et motivés, pas subis en silence.

La section 5 nomme la limite du mode par défaut au lieu de la laisser deviner, et exige qu'elle soit affichée. C'est rare et c'est bien.

### Findings
- **medium** Pas d'index des assumptions — huit tags `[ASSUMPTION]` sont disséminés dans le document sans récapitulatif en fin de PRD. Un lecteur ne peut pas savoir sur quoi il s'engage sans relire ligne à ligne. *Fix :* ajouter un index en annexe, un tag par ligne avec sa localisation.

## Downstream usability — adequate

Le glossaire existe et définit les termes qui portent le sens (composant, fiber, coeffect, porte humaine, payoff, run). Les identifiants FR sont uniques et les renvois croisés se résolvent. Les sections tiennent debout isolément, ce qui compte pour l'extraction par sous-agents en aval.

Deux faiblesses. Les identifiants FR-052 à FR-061 ont été ajoutés en fin de numérotation mais placés dans les sections F2, F3 et F10 : la lecture saute (…FR-015, FR-052, FR-053…). C'est le prix de la stabilité des identifiants, il est assumé, mais il faut le dire au lecteur. Et le glossaire n'a pas suivi les ajouts.

### Findings
- **medium** Glossaire en retard sur le document — « artefact », « mémoire de run », « composant généré », « scénario » et « casting » sont désormais des termes porteurs, aucun n'est défini. *Fix :* compléter le glossaire.
- **low** Numérotation non contiguë dans F2, F3 et F10 — conséquence assumée de la stabilité des identifiants. *Fix :* une phrase liminaire en section 7 expliquant que les identifiants sont stables et que l'ordre de lecture n'est pas l'ordre numérique.

## Shape fit — strong

Le produit est grand public par son mode d'entrée (un visiteur non prévenu) et multi-partie prenante par ses usages (recruteur, ingénieur, métier). Les parcours sont donc porteurs, et ils le sont effectivement. Le PRD n'est ni sur-formalisé (pas de personas flottantes, pas de matrice de traçabilité) ni sous-formalisé.

Le document est en tête de chaîne et se comporte comme tel : il porte les contraintes que l'architecture et l'UX vont consommer, et renvoie le « comment » technique vers l'addendum.

## Mechanical notes

- L'en-tête indique « Statut : brouillon — premier jet en voie rapide ». À corriger à la clôture, sinon le document se contredira avec son propre frontmatter.
- **Contradiction sévère, listée ici mais de portée critique** : M1, M2 et C2 sont des métriques d'entonnoir (part de visiteurs qui vont au bout, qui utilisent le payoff, qui quittent en cours de route). NFR-011 envisage « aucune » mesure d'audience. Trois métriques de succès sur six et une contre-métrique sont donc potentiellement non mesurables par construction. Q7 pose la question mais le PRD la laisse ouverte tout en gardant les cibles chiffrées.
- M6 est qualitative et sans seuil — acceptable pour un objectif personnel, à condition de l'assumer comme tel plutôt que de la présenter dans le même tableau que des cibles chiffrées.
- Renvois croisés vérifiés : FR-006, FR-015, FR-041, FR-052, C6 et §10 se résolvent tous.
- Les trois parcours ont chacun un protagoniste nommé, avec son contexte porté à l'intérieur du récit. Conforme.
