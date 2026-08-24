# Travail différé

Constats réels remontés par les relectures, mais qui ne relèvent pas de la story
où ils ont été trouvés. Append-only.

- source_spec: `spec-1-1-le-noyau-de-composition-isole.md`
  summary: Aucune intégration continue ne fait tourner `pnpm lint` et `pnpm test`.
  evidence: Pas de `.github/workflows` ni d'autre pipeline. La règle d'isolement du moteur, invariant central du produit, ne s'applique que si un humain pense à lancer le lint.

- source_spec: `spec-1-1-le-noyau-de-composition-isole.md`
  summary: `introspecter()` projette un modèle tenu par le noyau, pas l'état réel des fibers du moteur.
  evidence: `docs/0-DECISIONS.md` exige que le graphe se construise « depuis la vraie topologie de fibers/coeffects ». Le modèle actuel est alimenté par les crochets de cycle de vie ; c'est fidèle, mais rien ne le prouve. La story 1.8 doit comparer les deux ensembles, pas seulement lire le nôtre.

- source_spec: `spec-1-1-le-noyau-de-composition-isole.md`
  summary: Un composant qui déclare `fournit` sans jamais publier affame ses consommateurs sans diagnostic.
  evidence: Le nom reste réservé, les consommateurs restent en attente indéfiniment, aucun événement ne le signale. Le graphe montrera des nœuds en attente sans dire pourquoi. À trancher en story 1.4 : détection au bout d'un délai, ou état de nœud dédié.

- source_spec: `spec-1-1-le-noyau-de-composition-isole.md`
  summary: `Composant.injecte` ne sait pas exprimer une dépendance facultative.
  evidence: Toute dépendance déclarée bloque l'activation. Cordis distingue requis et facultatif ; le contrat ferme cette porte sans l'avoir décidé explicitement. À rouvrir si un agent doit pouvoir travailler en mode dégradé.

- source_spec: `spec-1-2-le-store-et-les-etats-derives.md`
  summary: Le journal des messages n'est pas borné.
  evidence: Chaque message recopie le tableau entier, et rien ne le tronque. Sans effet sur un run de 60 à 120 secondes ; à revoir si le mode LLM branché fait parler les agents beaucoup plus.

- source_spec: `spec-1-2-le-store-et-les-etats-derives.md`
  summary: Le moteur de règles complet de l'ancien run choréographié n'a pas été récupéré.
  evidence: `src/usine/run.ts` a été supprimé après le portage de l'interface. Ses trois scénarios et son jeu de règles d'allégations restent accessibles au commit `2750938`. À rapatrier en epic 4, quand le vérificateur sera écrit pour de bon.

- source_spec: `spec-1-2-le-store-et-les-etats-derives.md`
  summary: Aucun test de composant : les exigences d'interface ne sont vérifiées par rien d'automatique.
  evidence: Le pilote couvre le câblage sans navigateur, mais rien n'assure que la page ne défile pas, que les nœuds sont atteignables au clavier, ni que la préférence de mouvement réduit neutralise l'apparition. Il faudrait un exécuteur de tests en navigateur (Vitest browser + Playwright), déjà prévu pour la story 6.4.

- source_spec: `spec-1-2-le-store-et-les-etats-derives.md`
  summary: Le banc d'aperçu `spike/apercu/` pilote l'application par des sélecteurs CSS et des attentes fixes.
  evidence: Il sert à capturer l'application sans humain. Un renommage de classe le casse en silence. À remplacer par de vrais points d'ancrage de test le jour où l'exécuteur navigateur arrive.

- source_spec: `epic 2 — fabrication`
  summary: Le rapprochement des allégations est une simple recherche de sous-chaîne.
  evidence: « ne guérit pas » se classe « interdit » avec une citation réglementaire à l'appui. Ni négation, ni frontière de mot, ni guillemets. Acceptable pour une pièce fabriquée de démonstration ; inacceptable pour le vérificateur réel de l'epic 4, qui devra traiter la négation et la reformulation.

- source_spec: `epic 2 — fabrication`
  summary: La spécification de la pièce fabriquée est écrite en double.
  evidence: Le nom, les dépendances et les publications de `verificateur-allegations` existent à la fois dans le constructeur fabricant et dans les emplacements réservés du scénario, sans rien qui vérifie leur accord. Un renommage laisserait la pièce sans place. À dériver l'un de l'autre.

- source_spec: `epic 2 — fabrication`
  summary: Aucun contrôle de conformité entre la source affichée et le code exécuté pour la voie par évaluation.
  evidence: La voie par composition dérive sa source du code par `toString`, donc aucune dérive n'est possible. La voie par évaluation affiche le corps qu'elle a évalué, ce qui est correct, mais rien ne le vérifie automatiquement.

- source_spec: `epic 3 — porte humaine`
  summary: Le modèle de lecture ne connaît qu'une porte à la fois, alors que le noyau en expose une liste.
  evidence: `EtatRun.porte` est un champ unique, `portesEnAttente()` rend un tableau. Inatteignable avec le scénario livré, qui n'a qu'une porte ; à reprendre si un scénario en demande deux.

- source_spec: `epic 3 — porte humaine`
  summary: La parité visuelle des deux boutons repose sur une largeur minimale codée en dur.
  evidence: `min-width: 132px` fait tenir « ÉCARTER » et « APPROUVER » à la même taille, à deux pixels près. Un changement de libellé ou un repli de police casserait la parité en silence, et rien ne la vérifie. À reprendre avec l'exécuteur de tests en navigateur de la story 6.4.

- source_spec: `epic 3 — porte humaine`
  summary: La porte ne permet pas d'ouvrir les artefacts sur lesquels porte l'objection.
  evidence: L'objection cite des nombres réels (sorties, critères) mais n'offre aucun chemin vers le nœud du sceptique ni vers les artefacts amont. L'humain tranche sur une assertion qu'il ne peut pas vérifier sans fermer la porte et cliquer ailleurs.

- source_spec: `epic 4 — produit livré`
  summary: Le vérificateur tourne sur le fil principal, borné à 20 000 caractères par le champ de saisie.
  evidence: Un catalogue entier collé bloquerait l'interface. La borne évite le gel mais ne traite pas le cas d'usage de Sophie (UJ-3), qui veut passer son catalogue. Un traitement par lot relève d'une version serveur, explicitement hors v1.

- source_spec: `epic 4 — produit livré`
  summary: Aucun test de composant sur le bloc de payoff.
  evidence: Le branchement, les verdicts et les raisons sont couverts au niveau du pilote et des primitives, mais le rendu — bouton désactivé, raccourci clavier, message d'absence d'allégation, annonce aux lecteurs d'écran — n'est vérifié que par lecture. Story 6.4.

- source_spec: `epic 5 — mode LLM`
  summary: Un seul agent raisonne réellement.
  evidence: Seul l'architecte consomme le port. Le planificateur et le sceptique gagneraient à raisonner aussi, mais chaque agent branché multiplie le coût et la latence d'un run. À rouvrir quand le mode servira en entretien plutôt qu'en démonstration.

- source_spec: `epic 5 — mode LLM`
  summary: Rebrancher un modèle pendant un run n'a pas d'effet sur ce run.
  evidence: Le raisonneur est fixé au lancement. L'interface annonce le mode du prochain run, ce qui peut se lire comme le mode courant. À clarifier à l'écran, ou à interdire pendant un run.

- source_spec: `epic 5 — mode LLM`
  summary: L'architecte n'est pas réentrant vis-à-vis du raisonnement.
  evidence: Si le composant se désactive puis se réactive pendant qu'un appel est en vol, deux rappels peuvent publier la spécification, dont le second sera refusé. Inatteignable dans le scénario livré, où rien ne retire les dépendances de l'architecte en cours de route.

- source_spec: `epic 6 — mise en ligne`
  summary: La page charge Google Fonts, ce qui contredit « aucun tiers ».
  evidence: `index.html` tire Oswald depuis fonts.googleapis.com : l'adresse IP et l'agent du visiteur partent chez Google avant toute décision de mesure. Héberger les fichiers woff2 permettrait de refermer `style-src` et `font-src` sur `'self'` et de tenir la promesse.

- source_spec: `epic 6 — mise en ligne`
  summary: Le test de mouvement réduit vérifie l'existence de la règle, pas son effet.
  evidence: Playwright sait émuler `prefers-reduced-motion`, mais l'API n'est pas exposée par le fournisseur navigateur de Vitest tel qu'il est configuré ici. En attendant, le test contrôle que la règle est bien dans la feuille chargée et que les nœuds gardent leur état — c'est moins que la promesse.

- source_spec: `epic 6 — mise en ligne`
  summary: La parité de largeur des deux boutons de la porte n'est toujours pas vérifiée.
  evidence: Le test en navigateur les compte mais ne compare pas leurs largeurs rendues. Reporté depuis l'epic 3 ; l'outillage existe maintenant, il reste à écrire l'assertion.

- source_spec: `epic 6 — mise en ligne`
  summary: Le clavier est vérifié par `focus()` programmatique, pas par une vraie tabulation.
  evidence: Un élément peut recevoir le focus par programme tout en étant inatteignable par Tab. La vérification devrait envoyer de vraies frappes et contrôler l'ordre de tabulation, ainsi que la visibilité de l'anneau de focus.

## La pièce fabriquée ne revient pas après un échange de source à chaud

Quand la source de vérité est libérée puis remplacée à chaud, les agents
planifiés se désactivent puis se réactivent correctement. La pièce fabriquée,
elle, reste en attente de dépendance : son retour supposerait que son parent
la refabrique, et le nom qu'elle publie est encore réservé par la version
désactivée.

Conséquence : l'échange de source à chaud, qui n'est pas un geste de
l'interface, laisse le produit livré indisponible jusqu'au run suivant.
Couvert par un test qui dit exactement ce qui tient aujourd'hui
(`invariants.spec.ts`), pas par un test qui ment.

## L'usine sans clé ne montre qu'un run rejoué

Un modèle est ce qui fait naître les agents. Sans clé, l'usine ne peut rien
inventer — et un repli qui « inventerait » quand même ne serait qu'un catalogue
caché, exactement ce que ce produit refuse de montrer.

Le site rejoue donc des réponses préparées, pour un seul besoin, et l'annonce à
trois endroits : le badge de mode, l'explication dépliable, et une note sous le
champ quand le besoin saisi n'est pas celui que la démonstration sait jouer.

À faire quand la clé sera dans Coolify : enregistrer un vrai run et remplacer
les réponses préparées par cette transcription — la démonstration dira alors
« run réel du <date>, rejoué », ce qui est une phrase plus vraie.

## Le budget d'un run libre n'est pas mesuré en euros

Les bornes sont en agents, profondeur, tours et tokens. Le coût réel dépend du
modèle choisi et de la longueur des contextes, qu'aucune de ces bornes ne
plafonne directement. Le relais impose sa propre limite par adresse et par
jour ; c'est elle qui protège la facture aujourd'hui, pas le budget du run.

- source_spec: `_bmad-output/specs/spec-fork-timeline/stories/1-rejeu-borne-jusqu-a-n.md`
  summary: ReplayOutcome pourrait porter un discriminant (fin / point-de-fork-atteint / interrompu) plutôt que le seul booléen reachedEnd.
  evidence: Le consommateur réel (mode fork, story 4) devra distinguer un préfixe complet jusqu'à N d'un rejeu interrompu ; détectable aujourd'hui via lastSequence, mais un enum serait plus clair. Prématuré tant que le consommateur n'existe pas.
- source_spec: `_bmad-output/specs/spec-fork-timeline/stories/1-rejeu-borne-jusqu-a-n.md`
  summary: replayInto suppose un flux trié/sans doublons de sequence mais ne l'impose pas ; stopAt et l'adressabilité AD-36 en dépendent.
  evidence: readArchive trie mais archiveOf non, et rien ne dédoublonne ; un flux non trié ou à sequence dupliquée fausserait le bornage. Pré-existant, à traiter là où l'invariant d'unicité de sequence sera posé.
- source_spec: `_bmad-output/specs/spec-fork-timeline/stories/1-rejeu-borne-jusqu-a-n.md`
  summary: Un pace (paceMs>0) est attendu inutilement après le dernier événement dans la fenêtre stopAt avant de rendre la main.
  evidence: ~40ms de latence cosmétique après un préfixe déjà complet ; sans impact fonctionnel, à optimiser si la réactivité du fork le demande.
