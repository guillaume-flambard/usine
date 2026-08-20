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
