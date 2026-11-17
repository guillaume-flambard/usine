# ADR 0003 : l'usine trie chaque matin les PR et issues qui traînent

- **Statut** : accepté le 17 novembre 2026
- **Date** : 17 novembre 2026
- **Décideur** : Guillaume Flambard
- **Suivi** : Linear, projet « Usine v2 » (le ticket est ouvert avec le plan d'implémentation)

## Contexte

Le 17 novembre 2026, une question simple a tranché : qui se servirait de l'usine tous les jours ? Personne, pas même son auteur. Elle répondait à une question que personne ne se pose (« un nouveau contributeur peut-il démarrer ? ») et restait une vitrine.

Or le propriétaire a un vrai problème quotidien. Le relevé `~/.agent/OPEN-WORK.md` comptait, au 10 novembre 2026, 49 PR ouvertes depuis plus de 2 jours et 54 issues sans activité depuis 14 jours, dans 29 dépôts des comptes `guillaume-flambard` et `memolabs-dev`. Une bonne partie sont des mises à jour automatiques (Dependabot). Sa règle `issue-lifecycle.md` (« ne rien laisser ouvert », 2 novembre 2026) demande de fermer ce qui ne sert plus, preuve à l'appui, et de garder dans le doute. Personne ne le fait au quotidien.

Le relevé lui-même est arrêté depuis le 10 novembre : `watch-open-work.py` ne l'a plus régénéré. L'usine ne doit donc pas le lire, mais lire GitHub en direct.

Un second critère compte : l'usine sert aussi à trouver du travail. Chaque brique doit être un outil que le marché cherche (LangGraph, agents LangChain, MCP, LiteLLM, Langfuse), utilisée là où elle apporte quelque chose, et défendable en entretien.

Trois approches ont été comparées :

| Option | Pour | Contre |
|---|---|---|
| A. Tout par les agents | réutilise tout l'existant | chaque matin coûte des appels de modèle sur 29 dépôts ; un agent peut rater ou inventer un élément |
| **B. Un pré-tri par règles, puis les agents pour juger** | les faits viennent de GitHub, pas d'un modèle ; les agents ne travaillent que sur les cas qui demandent du jugement ; moins cher et plus fiable | un nœud de plus à écrire et à tester |
| C. Des règles seules | le plus simple | plus rien d'agentique : l'usine perd ce qu'elle montre |

## Décision

1. **L'usine trie chaque matin à 8 h (heure de Paris)** les PR ouvertes depuis plus de 2 jours et les issues sans activité depuis 14 jours. Un timer systemd du VPS appelle `POST /api/triage` avec un jeton de service qui ne sait faire que lancer ce tri.
2. **Périmètre** : les dépôts des comptes `guillaume-flambard` et `memolabs-dev`, **sauf les dépôts à bénévoles** (régime C de `git-workflow.md` : `mediterranean-rescue`, `sosmed-carto-recette`, tout dépôt Data for Good). La liste d'exclusion vit dans `config/` et le code la vérifie deux fois : au tri, puis juste avant d'agir.
3. **Actions permises** : commenter, puis fermer une PR ou une issue. **Jamais de fusion** : `merge_pull_request` reste hors de la liste blanche.
4. **Un nœud de pré-tri, sans modèle**, en tête du graphe LangGraph. Il lit GitHub et attache à chaque élément des faits vérifiables : âge, auteur, état de la CI, conflit, PR plus récente qui la remplace, PR fusionnée qui la cite. Il range chaque élément dans un de trois groupes :
   - **évident**, quand une règle tranche : une PR Dependabot remplacée par une plus récente du même paquet, ou une issue citée par une PR fusionnée (« Closes #n » ou mention) ;
   - **à juger** : tout le reste qui traîne, dont les brouillons de plus de 14 jours sans commit ;
   - **à garder** : rien à proposer.
   Une issue étiquetée P0 ou P1 n'est **jamais** fermée par une règle : elle va toujours aux agents.
5. **Les agents jugent en parallèle.** Le superviseur répartit les cas « à juger » par dépôt avec `Send`. Chaque agent LangChain lit ses éléments par le serveur MCP officiel de GitHub, en lecture seule, et rend une **sortie structurée validée par Pydantic** : décision (`fermer`, `relancer`, `garder`), motif (`résolu`, `doublon`, `dépassé`, `abandonné`), preuve sous forme de lien obligatoire, et texte du commentaire. **Une décision sans preuve devient « garder »** (règle « dans le doute, on garde »).
6. **Une seule porte, en liste à cocher.** La porte (`interrupt()`) présente les propositions évidentes, puis celles des agents. Chacune montre le dépôt, le titre, le motif avec sa preuve et le commentaire exact qui partira. Toutes sont cochées par défaut. Un bouton approuve ce qui est coché, un autre rejette tout avec un motif. Sans décision, la porte expire en 24 h et rien ne part.
7. **L'exécution**, pour chaque élément coché, commente d'abord avec `add_issue_comment`, puis ferme : `issue_write` (`method: update`, `state`, `state_reason`) pour une issue, `update_pull_request` (`state`) pour une PR. Un échec n'arrête pas les autres ; il est journalisé dans le run avec sa cause.
8. **La liste blanche MCP** (`config/mcp-servers.yaml`) gagne `add_issue_comment` et `update_pull_request`, classés `irreversible`, donc derrière la porte.
9. **Les évaluations.** Chaque décision prise à la porte (coché ou décoché) devient une ligne d'un jeu de données Langfuse. La précision des agents (la part de leurs propositions acceptées) se suit au fil des jours.
10. **Le signal.** Une ligne apparaît dans `~/.agent/LIVE-STATE.md` : « Tri du jour : N propositions, à valider », avec le lien du run.

## Critères d'acceptation

- Un tri lancé sur des données GitHub enregistrées classe chaque élément dans le bon groupe, et aucun élément d'un dépôt exclu n'apparaît.
- Un élément étiqueté P0 ou P1 n'est jamais dans le groupe « évident ».
- Une décision d'agent sans lien de preuve arrive à la porte comme « garder », pas comme « fermer ».
- Rien ne s'exécute sans approbation ; un élément décoché ne s'exécute pas ; aucune action ne vise un dépôt exclu, même si la porte la contenait.
- `merge_pull_request` est refusé par la liste blanche.
- Un dépôt illisible ou un agent en panne n'arrêtent pas le tri, et le résultat le dit.
- La valeur de `state` acceptée par `update_pull_request` pour fermer une PR est vérifiée par un essai réel sur un dépôt de test avant la mise en service (la documentation ne liste pas les valeurs permises).
- La décision prise à la porte est enregistrée dans Langfuse.

## Conséquences

- Une étape revient au propriétaire : créer un PAT à grain fin limité à ses dépôts, avec Issues et Pull requests en écriture et Contents en lecture, et le poser dans le `.env` du service. L'agent ne crée pas de jeton.
- Le jeton actuel (`USINE_GITHUB_TOKEN`, limité au dépôt `usine`) ne suffit plus pour le tri.
- **Correction du 17 novembre 2026 (revue de l'implémentation)** : un PAT à grain fin ne couvre qu'un seul propriétaire (« Each token is limited to access resources owned by a single user or organization », docs.github.com, *Managing your personal access tokens*). Un seul jeton à grain fin ne lirait donc qu'un des deux comptes, et la recherche ne verrait de l'autre que ses dépôts publics, sans que le tri puisse le savoir. **Décision du propriétaire, le même jour : deux jetons à grain fin, un par compte** (`USINE_TRIAGE_TOKEN_GUILLAUME_FLAMBARD`, `USINE_TRIAGE_TOKEN_MEMOLABS_DEV`, nommés dans `config/triage.yaml`). Chaque lecture et chaque écriture part avec le jeton du propriétaire du dépôt, par un transport MCP qui garde son jeton et ses sessions pour lui ; le jeton du chat reste limité au dépôt `usine`. Un compte sans jeton n'est pas lu, et le tri le dit. Le tri ne s'active pas tant que `USINE_TRIAGE_ORG` n'est pas posé.
- La visite publique pourra, plus tard, rejouer un vrai tri à la place de la question du guide de contribution.
- Le collecteur `watch-open-work.py`, arrêté depuis le 10 novembre 2026, est hors périmètre : c'est un chantier à part.
- Hors périmètre aussi : fusionner, étiqueter, assigner, et trier d'autres plateformes que GitHub.

## Sources

- Le serveur MCP officiel de GitHub, README de `github/github-mcp-server` (lu le 17 novembre 2026) : `add_issue_comment` commente une issue ou une PR ; `issue_write` met à jour une issue (`method`, `state`, `state_reason`) ; `update_pull_request` change l'état d'une PR (`state`, valeurs non listées) ; `merge_pull_request` fusionne.
- `~/Vault/4-Tools/rules/issue-lifecycle.md` (2 et 28 octobre, 2 novembre 2026) et `git-workflow.md` (régimes A, B, C).
- `~/.agent/OPEN-WORK.md`, relevé du 10 novembre 2026.
- ADR 0001 : les frameworks agentiques du marché (LangGraph, LangChain, MCP, LiteLLM, Langfuse).
