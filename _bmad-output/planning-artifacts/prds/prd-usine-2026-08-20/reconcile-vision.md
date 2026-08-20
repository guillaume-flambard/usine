# Réconciliation — docs/1-VISION.md

Confronté à `prd.md` + `addendum.md`.

## Repris fidèlement
- Le pitch, l'insight marché (jugement et orchestration plutôt qu'écriture de code), les trois couches, la doctrine sku-regulator (PRD §9), la frugalité, le garde-fou « ne pas rebuild le runtime » (addendum), l'objectif CDI (PRD §2, R6).

## Écarts

### E1 — L'auto-évolution a disparu du PRD (majeur)
La vision insiste : le système « se crée ses outils », « spawn d'autres agents qui se connectent », « agents qui créent des agents ». `2-EXECUTION` va plus loin : « un agent génère un composant et le charge ; HMR le swap à chaud ; tout est réversible ». C'est le cœur de la promesse « usine ».

Le PRD ne porte aucune exigence de génération de composant à l'exécution. FR-011 dit que l'agent maître spawn des composants — mais des composants déjà écrits, tirés du scénario. La différence entre « spawner un composant préexistant » et « fabriquer un composant puis le charger » est exactement la différence entre une orchestration et une usine.

Le mécanisme vit dans l'addendum ; l'exigence produit n'existe nulle part.

### E2 — La mémoire (self-story) n'est nulle part
Étape 1 de la vision : l'agent maître « se dote d'une mémoire (self-story) — ce qu'il sait du secteur ». Absent du PRD, de l'addendum, et du graphe.

### E3 — Les artefacts produits par les agents ne sont pas exigés
La vision fait produire aux agents des user stories, un PRD avec critères d'acceptation, un choix d'architecture. Le PRD n'exige jamais que ces artefacts soient consultables. Or c'est une part du « pas creux » : pouvoir cliquer sur le nœud PM et lire ce qu'il a réellement écrit.

### E4 — Le registre « wahou » s'est perdu (qualitatif)
La vision assume le spectacle : « théâtrale, impressionnante, assumée comme spectacle », « le flex ultime ». Le PRD est honnête et sobre, mais il a troqué l'ambition contre la prudence. Rien dans le document ne dit que ça doit impressionner. La contre-métrique C2 traite même le spectacle comme un risque d'abandon.

Ce n'est pas une erreur, c'est un arbitrage — mais il doit être conscient.
