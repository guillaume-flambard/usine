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
