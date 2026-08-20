# Réconciliation — docs/2-EXECUTION.md

Confronté à `prd.md` + `addendum.md`.

## Repris fidèlement
- Séparation en deux couches (noyau Cordis / couche agentique) : addendum.
- Contrat de composant `inject` / `provide` / `apply` : PRD FR-008 à FR-010, addendum.
- Ce qui est validé le 2026-08-20 et ce qui reste à câbler : addendum.
- Le user flow (brief, lancer, regarder, payoff) : PRD §4 et F1, F3, F6.
- Compteurs live : FR-047, FR-048.
- Les deux modes : PRD §5.
- Le phasage : PRD §12, resserré et re-porté.

## Écarts

### E5 — La distribution des agents n'est pas dans le PRD (majeur)
`2-EXECUTION` nomme le casting : Planner, Architecte, outils (registre EU, MCP, pgvector), builders parallèles étiquetés par techno (Frontend, API, DB, Moteur de vérif, Tests), Skeptic, Human gate, Deploy.

Le PRD ne nomme que le Skeptic (FR-033) et la porte humaine. Or ce casting est produit, pas architecture : la **largeur des technologies affichées** est explicitement une part du wahou (« le wahou vient du graphe qui pousse + de la breadth des technos »). Sans exigence, un implémenteur peut livrer un graphe de quatre nœuds génériques et respecter le PRD à la lettre.

### E6 — Stack périmée, non corrigée à la source
`2-EXECUTION` prescrit Next.js / React / Tailwind, Node/NestJS ou FastAPI, Postgres + pgvector, LangChain/LangGraph, VPS Netcup. `0-DECISIONS` prime et impose Vue 3 + Vite, client-only. L'arbitrage est tracé dans l'addendum, mais `docs/2-EXECUTION.md` n'a pas été corrigé — l'erreur reste en place et se propagera.

### E7 — Le déploiement est sous-spécifié
`2-EXECUTION` et `0-DECISIONS` donnent Dockerfile node22 vers nginx, VPS, `lab-hub/public/projects.json`. Le PRD n'en dit rien hors §12 (« mise en ligne »). C'est de l'architecture, c'est dans l'addendum — mais l'entrée dans le hub est une exigence produit, pas une modalité technique.
