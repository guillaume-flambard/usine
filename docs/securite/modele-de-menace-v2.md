# Modèle de menace de l'usine v2

Écrit le 14 novembre 2026 (Linear MEM-9). Il remplace `docs/8-THREAT-MODEL.md`,
qui décrivait la v1, quand le code des agents tournait dans le navigateur. La v2
déplace les agents côté serveur, leur donne des outils MCP, leur fait lire des
documents (RAG) et fait tourner la CI sur le VPS. La surface d'attaque change.

**Référence** : *OWASP Top 10 for LLM Applications 2026*, OWASP GenAI Security
Project, publié le 3 août 2026. Page officielle :
https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/. La liste
ci-dessous a été relevée dans le PDF officiel (122 pages), et non dans des
sources secondaires.

Chaque menace renvoie soit à une parade déjà en place, avec sa preuve, soit à
l'issue Linear qui la porte. Une parade « en place » est vérifiée ; une parade
« prévue » ne l'est pas encore.

## 1. Les dix menaces OWASP 2026, appliquées à l'usine

| Menace | Ce qui l'expose ici | Parade | État |
|---|---|---|---|
| **LLM01:2026 Prompt Injection** | Brief de l'utilisateur ; documents du RAG ; réponses des outils MCP (injection indirecte) | Contenus externes balisés comme données ; aucun outil irréversible déclenché par un contenu externe seul, porte humaine obligatoire ; jeu de tests rouges d'au moins 15 cas | prévue : MEM-54, MEM-20, MEM-53 |
| **LLM02:2026 Sensitive Information Disclosure** | Données personnelles dans les briefs ; traces Langfuse ; cassettes de rejeu ; archives exportées ; corpus RAG | `PIIMiddleware` en entrée et en sortie ; filtre à l'ingestion ; cassettes sans secrets ; liste revue des champs exportés ; corpus de démo listé à la main | en place : liste revue des champs exportés (`services/api/tests/test_archive.py`, MEM-26) · prévue : MEM-53, MEM-43, MEM-24, MEM-48 |
| **LLM03:2026 Excessive Agency** | Outils MCP, spécialistes qui agissent, agent codeur (Claude Agent SDK) qui écrit des fichiers | Liste blanche de serveurs MCP avec un niveau de risque par outil ; `interrupt()` avant toute action irréversible ; limites d'appels d'outils ; agent codeur en bac à sable sans réseau ; serveur MCP de l'usine authentifié | prévue : MEM-37, MEM-20, MEM-53, MEM-32, MEM-40 |
| **LLM04:2026 Supply Chain** | Dépendances npm et PyPI, frameworks en 0.x, images Docker de base | Lockfiles figés et vérifiés (`--frozen-lockfile`, `UV_LOCKED=1`, `uv lock --check` dans `verify.sh`) ; scripts d'installation npm autorisés un par un (`allowBuilds`) ; PR venues d'un fork jamais vérifiées sur le VPS ; mises à jour suivies et images épinglées par digest | en place : `scripts/verify.sh`, `pnpm-workspace.yaml`, lab-infra #376 · prévue : MEM-73, MEM-57 (scan d'images) |
| **LLM05:2026 Data and Model Poisoning** | Corpus RAG ; jeux d'éval ; choix des modèles | Sources déclarées par nom, jamais par URL libre ; corpus listé et revu ; jeux d'éval versionnés avec leur provenance ; gate CI qui fait échouer une régression d'éval ; modèles choisis dans LiteLLM, côté serveur | prévue : MEM-43, MEM-48, MEM-49, MEM-56, MEM-13 |
| **LLM06:2026 Unbounded Consumption** | Coût des appels de modèle, spécialistes en boucle, vérifications sur le builder | Bornes et limiteur de débit par adresse et global, déjà dans l'API (`usine_api/limits.py`) ; un seul commit vérifié par passage du builder, sous `timeout` ; budgets par run et par jour, limites d'appels | en place : `limits.py`, lab-infra #376 · prévue : MEM-55, MEM-53 |
| **LLM07:2026 Misinformation** | Réponses du RAG, verdicts du juge, et le discours du produit lui-même | Citations obligatoires et abstention contrôlée ; fidélité mesurée par Ragas ; juge calibré contre 20 cas annotés avant de servir de gate ; garde-fou d'honnêteté de `CLAUDE.md` (le retour arrière ne défait pas un effet externe) | en place : garde-fou d'honnêteté · prévue : MEM-46, MEM-50, MEM-52 |
| **LLM08:2026 Hidden Context Exposure** | Invites système, contexte caché des spécialistes, traces | Aucun secret dans une invite : les clés vivent dans l'environnement du service, jamais dans le paquet web ni dans un contexte de modèle ; invites versionnées dans Langfuse, dont l'accès est authentifié ; atelier derrière une authentification | en place : invariant 1 de `docs/architecture/v2.md`, Langfuse authentifié · prévue : MEM-60 |
| **LLM09:2026 Vector and Embedding Weaknesses** | pgvector, Qdrant, fragments récupérés | Base joignable seulement par l'API (le compose de dev publie sur 127.0.0.1, la prod ne publie rien) ; filtrage par métadonnées ; fragments traités comme données ; un seul corpus, pas de mélange entre clients | en place : `compose.yaml` · prévue : MEM-44, MEM-46, MEM-54, MEM-58 |
| **LLM10:2026 Improper Output Handling** | Sorties de modèle affichées dans le web, code généré, sorties structurées | Le code écrit par un modèle ne s'exécute ni dans la page ni dans l'API (invariant 7) ; `v-html` interdit par ESLint (`vue/no-v-html`) ; `eval` et `new Function` interdits ; sorties structurées validées par Pydantic ; diff de l'agent codeur relu à la porte humaine avant toute PR | en place : `apps/web/eslint.config.ts` · prévue : MEM-31, MEM-32, MEM-70 |

## 2. Menaces propres à l'usine, hors liste OWASP

| Menace | Parade | État |
|---|---|---|
| **Code d'une PR exécuté sur le VPS** : le builder vérifie les PR dès leur ouverture, avant toute relecture | PR du dépôt seulement (les forks sont exclus et testés) ; jeton GitHub retiré de `docker build` ; `RUN --network=host` refusé et registre `:5000` injoignable, vérifiés par une sonde le 14 novembre 2026 ; `timeout` sur chaque vérification | en place : lab-infra #376 |
| **Faux statut `usine/verify`** posé par un autre acteur | Seuls les statuts publiés par l'identité du builder comptent. Limite : ce jeton est aujourd'hui celui de Guillaume, et une identité dédiée renforcerait le filtre | en place, avec la limite dite · à décider |
| **Fusion d'une PR rouge** | Protection de `v2` : `usine/verify` obligatoire, administrateurs compris, force-push interdit. Prouvé par la PR rouge #54, refusée (`BLOCKED`) | en place : MEM-6 |
| **Secret commité** | gitleaks au pre-commit, prouvé par un faux jeton refusé ; GitGuardian sur chaque PR ; `.env` exclu de git et du contexte Docker | en place : `lefthook.yml`, `.dockerignore` |
| **Atelier ouvert à tous** : ses routes réécrivent des invites de production | Authentification sur un routeur dédié, échec en fermé | prévue : MEM-60 |

## 3. Registre des secrets

Aucune valeur ne vit dans le dépôt. `.env.example` donne les noms, sans aucune
valeur. En local, les valeurs sont dans `.env`, ignoré par git et par Docker.

| Variable | Rôle | Source en dev | Source en prod |
|---|---|---|---|
| `POSTGRES_PASSWORD` | Mot de passe de la base | `.env`, monté en secret Compose dans `/run/secrets/postgres_password` | injecté par `lab-infra` (MEM-58) |
| `LITELLM_API_KEY` | Clé virtuelle `usine-lab` vers la passerelle LiteLLM du lab, limitée à `lab-fast`, `lab-agent`, `lab-code` et `code-gemini` | `.env` | `/opt/stacks/usine/.env` (mode 600) |
| `OPENROUTER_API_KEY`, `BAI_API_KEY` | Clés de fournisseur de la v1. `services/api` ne les lit plus depuis MEM-13 ; seul le relais v1 de `main` lit encore `OPENROUTER_API_KEY` | `.env` (à retirer) | stack v1 de `lab-infra`, jusqu'à la bascule |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | Traces et invites | `.env` | `lab-infra` |
| `SMTP_PASSWORD` | Envoi du lien de connexion | `.env` (vide en dev : le lien est seulement journalisé) | `lab-infra` |
| `GH_TOKEN` (builder) | Lire le dépôt, publier `usine/verify` | sans objet | `/etc/github.env` sur le VPS, jamais transmis à `docker build` |

Rotation d'un secret : procédure dans `docs/runbook.md` (MEM-63).

## 4. Où vit un run, et ce que sa suppression efface

Un run v2 est un thread LangGraph (MEM-18). `DELETE /api/runs/{thread_id}` efface :

- ses checkpoints : tables `checkpoints`, `checkpoint_blobs` et `checkpoint_writes`, par `adelete_thread` du checkpointer ;
- son index : la ligne de `threads` (titre, organisation, statut, et chaque tour avec son brief, sa réponse et ses événements).

Un test vérifie dans Postgres qu'il ne reste rien du thread (`tests/test_runs_api.py`, avec `USINE_TEST_DATABASE_URL`).

**Ce qui reste dans Langfuse** (projet « Agents du lab », MEM-16), et que la suppression d'un run ne touche pas :

- la trace de l'usine (session = `thread_id`, utilisateur = id du compte, jamais l'email), avec les entrées et les sorties des nœuds et des appels de modèle, donc le brief et la réponse ;
- les traces de LiteLLM des mêmes appels (même session), avec les jetons et le coût, mais sans le contenu des messages (`capture_message_content` reste à `no_content`).

Langfuse OSS ne supprime rien de lui-même : la rétention automatique est réservée à l'édition Entreprise (https://langfuse.com/docs/administration/data-retention).

**Effacement RGPD d'un run dans Langfuse**, à la main tant qu'il n'est pas automatisé (https://langfuse.com/docs/administration/data-deletion) :

1. lister les traces de la session : `GET /api/public/v2/observations?sessionId=<thread_id>&fields=core`, puis relever les `traceId` distincts ;
2. les supprimer par lots de 1 000 au plus : `DELETE /api/public/traces` avec `{"traceIds": [...]}`. La suppression emporte les observations et les scores de ces traces, et Langfuse annonce qu'elle prend en général moins de 15 minutes ;
3. recommencer l'étape 1 pour vérifier qu'il ne reste rien.

Pour effacer un compte entier, il faut le faire pour chacun de ses threads : il n'existe pas de suppression par utilisateur.
