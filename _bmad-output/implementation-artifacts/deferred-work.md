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
