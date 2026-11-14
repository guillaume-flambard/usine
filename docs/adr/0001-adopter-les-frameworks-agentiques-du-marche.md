# ADR 0001 : adopter les frameworks agentiques du marché

- **Statut** : accepté
- **Date** : 14 novembre 2026
- **Décideur** : Guillaume Flambard
- **Suivi** : Linear MEM-2, projet « Usine v2 : refonte agentique » (P-MEM-7)
- **Remplace** : la section « Frameworks et SDK » de `docs/4-STACK.md` et le rôle central de Cordis dans `CLAUDE.md`

## Contexte

La v1 de l'usine refusait tout framework d'agents. `docs/4-STACK.md` le disait en toutes lettres : « Rien, et c'est le seul choix qu'on défend frontalement ». À la place, elle s'appuyait sur Cordis, un runtime de composition qui tourne dans le navigateur. Ce choix tenait pour un produit de démonstration. Il ne tient plus pour l'objectif qui compte aujourd'hui : montrer à un client ou en mission une stack d'IA générative agentique en production, construite avec les outils que les offres demandent.

L'étude de demande du 14 novembre 2026 a mesuré ces outils. Ses sources sont listées en fin de document.

| Outil | Free-Work France (résultats) | Autres signaux |
|---|---|---|
| LangChain | 40 | 34,5 % de 1 135 annonces d'agents (agentic-engineering-jobs.com, mars à mai 2026) ; 32,9 % d'usage (Stack Overflow 2025) |
| LangGraph | 40 | 256 annonces ; 16,2 % d'usage |
| MCP | 6 (« Model Context Protocol ») | présent dans 17 à 24 % des annonces d'agents |
| LlamaIndex | 14 | 150 annonces ; 13,3 % d'usage |
| CrewAI | 14 | 106 annonces, à forte part européenne |
| Langfuse | 11 | 8,8 % d'usage pour l'observabilité |
| pgvector | 6 | 17,9 % d'usage pour la mémoire d'agent |
| Mastra | 0 | très téléchargé, absent des annonces françaises |
| Cordis | non cité | absent de toutes les annonces et enquêtes relevées |

La demande française se concentre sur Python : LangChain et LangGraph, puis MCP, LlamaIndex et CrewAI, avec Langfuse et pgvector pour la production.

## Décision

L'usine v2 est reconstruite sur les frameworks les plus demandés. **Chaque outil a un rôle réel dans le produit**, et aucun n'est là pour la liste.

| Couche | Outil | Rôle |
|---|---|---|
| Front | Vue 3, TypeScript, Vite, Nuxt UI 4, Vercel AI SDK (`@ai-sdk/vue`) | Conversation en flux, scène, graphe vivant |
| API | FastAPI, Pydantic | Contrats HTTP, flux UI message stream |
| Orchestration | LangGraph 1.x | Superviseur. Ses checkpoints Postgres servent à rejouer et à forker, et `interrupt()` sert de porte humaine |
| Agents | LangChain v1 (`create_agent`) et ses middlewares | Spécialiste de référence et garde-fous |
| Spécialistes interchangeables | CrewAI, OpenAI Agents SDK, Pydantic AI, Claude Agent SDK | Le même rôle derrière un contrat commun, remplaçable à chaud sur une branche forkée |
| RAG | LlamaIndex, pgvector, Qdrant en option | Ingestion, recherche, citations |
| Outils | MCP (`langchain[mcp]`), FastMCP | Consommer des serveurs d'outils, exposer l'usine |
| Modèles | LiteLLM (passerelle du lab), Ollama en local | Une seule porte pour les clés, les quotas et les coûts |
| Observabilité | Langfuse auto-hébergé | Traces, invites versionnées, coûts |
| Évaluation | Ragas, DeepEval, expériences et LLM-juge de Langfuse | Gate CI sur les régressions |
| Déploiement | Docker Compose, Traefik, runner du lab | Chaîne de `lab-infra` |

**Cordis est retiré.** Le time travel de l'état, qui était sa raison d'être dans l'usine, est désormais porté par les checkpoints de LangGraph, documentés : https://docs.langchain.com/oss/python/langgraph/use-time-travel

## Ce qui ne change pas

- **La thèse du produit.** On rejoue une trajectoire, on forke, on remplace à chaud et on compare deux futurs, sous porte humaine.
- **Les deux garde-fous d'honnêteté.** Le retour arrière restaure l'état de l'agent, jamais un effet externe. On ne prétend jamais à une « plateforme de fiabilité ».
- **Le flux d'événements comme format d'archive.** Pas d'objet vivant, pas de date absolue.
- **Les quatre zones de l'interface et les règles de sécurité.** La clé du fournisseur reste côté serveur. Un agent nomme un serveur d'outils, jamais une adresse.

## Conséquences

- **Règles d'architecture.** Les règles 1 (« seul `src/runtime/` importe cordis ») et 3 (le code du modèle dans un Web Worker) du `CLAUDE.md` décrivent la v1. Elles sont remplacées au fil des jalons par `docs/architecture/v2.md` (MEM-8).
- **Partage avec `lab-infra`.** L'usine et les agents du lab partageront la même stack et un socle commun (jalon M8). `lab-infra` garde la génération des stacks (`agent.yaml`) et le déploiement 24/7. Les agents du lab abandonnent le choix « stdlib seule sur alpine » pour une image de base construite une fois (MEM-67).
- **Historique.** Les documents `docs/0` à `docs/7` restent lisibles comme historique de la v1, avec une mention en tête.
- **Suivi.** Linear devient la seule autorité du backlog. Le retrait du suivi BMad et OpenSpec est l'objet de MEM-72.
- **Production.** `main` continue de servir la v1 jusqu'à la bascule (MEM-65). La v2 se construit sur la branche d'intégration `v2`.

## Risques et parades

| Risque | Parade |
|---|---|
| Une stack qui ressemble à un CV : beaucoup d'outils, aucun travail réel | Un rôle par outil, et une carte des technologies dans le README qui renvoie, pour chacun, au fichier et au test qui le prouvent (MEM-64) |
| Des API encore en 0.x qui bougent : Claude Agent SDK 0.2, OpenAI Agents SDK 0.24, LlamaIndex 0.14, Ragas 0.4, et `langchain[mcp]` en beta | Versions épinglées, un spike par framework avant intégration, et le contrat `Specialist` (MEM-27) qui isole chaque framework derrière une interface |
| Coût des modèles multiplié par quatre spécialistes et l'évaluation | Rejeu par cassettes en CI (MEM-24), budgets par run et par jour (MEM-55) |
| Surface d'attaque élargie : outils MCP, documents RAG, code généré | Modèle de menace OWASP Top 10 LLM (MEM-9), liste blanche MCP (MEM-37), défense contre l'injection indirecte (MEM-54), bac à sable pour le Claude Agent SDK (MEM-32) |

## Options écartées

- **Tout TypeScript** (LangGraph.js, Vercel AI SDK, Mastra, en gardant Cordis) : un seul langage avec Vue, mais une demande française quasi nulle pour Mastra et pour le Vercel AI SDK côté serveur.
- **Refonte minimale** (un seul agent LangGraph en vitrine à côté de la v1) : moins de risque, mais elle ne répond pas à l'objectif. Guillaume a demandé une refonte complète.
- **AutoGen** : son dépôt indique qu'il n'est plus maintenu et renvoie vers Microsoft Agent Framework.
- **Semantic Kernel et Microsoft Agent Framework** : surtout tournés vers .NET et Azure, avec 5 offres sur Free-Work.
- **Haystack et DSPy** : 0 offre relevée.
- **Google ADK** : 5 offres. Il reste candidat comme cinquième spécialiste si une mission le demande.
- **Spec Kit** : écarté, parce qu'il ajouterait une troisième source de vérité sur les spécifications (voir MEM-72).

## Sources

- Free-Work : `https://www.free-work.com/fr/tech-it/jobs?query=<mot-clé>`, relevé le 14 novembre 2026
- https://agentic-engineering-jobs.com/ai-agent-frameworks-job-market-2026
- https://survey.stackoverflow.co/2025/ai
- Versions et téléchargements : PyPI, pypistats.org, registry.npmjs.org, api.npmjs.org, API GitHub, relevés le 14 novembre 2026
- LangGraph : https://docs.langchain.com/oss/python/langgraph/checkpointers et https://docs.langchain.com/oss/python/langgraph/interrupts
- LangChain MCP : https://docs.langchain.com/oss/python/langchain/mcp
- Middlewares LangChain : https://docs.langchain.com/oss/python/langchain/middleware/built-in
- Protocole de flux du Vercel AI SDK : https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
- Composants Chat de Nuxt UI : https://ui.nuxt.com/docs/components/chat
- Langfuse : https://langfuse.com/docs/integrations/langchain/tracing et https://langfuse.com/self-hosting
- Ragas : https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/
- README de `microsoft/autogen` (statut du projet et renvoi vers Microsoft Agent Framework)
