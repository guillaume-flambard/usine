# Memo Labs — L'usine agentique · Vision

## Le pitch en une phrase
Un système agentique qui, à partir d'un besoin métier dans un secteur défini, **s'auto-orchestre de bout en bout** — il se dote d'une mémoire, écrit les specs, se crée ses outils, spawn d'autres agents qui se connectent, code, vérifie, livre — **et on regarde toute l'usine tourner en direct, en graphe.** À la fin, un vrai produit sort.

## L'insight (pourquoi ça)
- Le marché ne paie plus "écrire du code" : il paie **le jugement** et **l'orchestration d'agents** (agentic engineering vs vibe coding). C'est le titre que les entreprises recherchent.
- La compétence rare = **piloter l'IA sans perdre la maîtrise** : le modèle propose, l'humain (et le code déterministe) disposent.
- Un produit **vendable** est automatiquement la meilleure preuve. Une démo léchée sur un marché saturé n'est qu'une démo. On veut du réel.
- Notre actif : le savoir-faire full-stack + agentique (LLM contraint, human-in-the-loop, RAG, billing) et un vrai projet régulé déjà construit (sku-regulator).

## La vision, détaillée
Un **agent maître** reçoit un brief ("construis un outil de conformité des allégations santé pour marques de compléments EU"). Pour y répondre, il :
1. se dote d'une **mémoire (self-story)** — ce qu'il sait du secteur ;
2. génère les **user stories** puis un **PRD** avec critères d'acceptation ;
3. choisit l'**architecture** (la stack) ;
4. **se crée / se branche les outils** dont il a besoin (registre EU, serveur MCP, index vectoriel) ;
5. **spawn des agents spécialisés** (frontend, API, base de données, moteur de vérification, tests) qui **se connectent entre eux** ;
6. ils **codent et font tourner** le produit ;
7. un **skeptic** attaque le résultat, un **humain valide** (human gate) ;
8. un agent **déploie** ;
9. **un vrai produit apparaît et fonctionne.**

Tout est visible comme un **graphe vivant** : les agents se spawnent, les outils se créent, les arêtes de dépendance poussent, les états de cycle de vie s'allument. Agents qui créent des agents et des outils qui se connectent.

## Les trois couches
1. **La vitrine générale wahou** = le flagship Memo Labs. L'usine construit un produit de A à Z en direct. Théâtrale, impressionnante, assumée comme spectacle.
2. **La substance réelle dans la niche** : le produit livré à la fin (le "Claim Check" compléments) **fonctionne pour de vrai**, adossé au vrai sku-regulator. Le wahou devant, la substance dans la niche.
3. **Des démos par niche** ensuite : le même moteur pointé sur d'autres secteurs (conformité, deal-screening, clinique…), chacune un produit réel.

## Le principe : impressionnant ET pas creux

**Révisé le 2026-08-20.** La version initiale acceptait un milieu simulé pour la vitrine publique. `0-DECISIONS.md` l'a rejeté : le milieu est réel lui aussi.

- Le **milieu** est une **vraie composition** : de vrais composants Cordis qui se chargent, se câblent, fabriquent des composants à l'exécution et se libèrent proprement. Ce qui est déterministe en mode par défaut, c'est le *jugement* des agents — pas leur existence, pas leur travail.
- Le **payoff final** (le check de conformité) tourne vraiment.
- Rien n'est simulé, et ça reste **gratuit et instantané** : zéro clé, zéro token par visiteur. C'est ce qui fait qu'un recruteur ou un client dit « ok, c'est pas du vent ».

## La décision (arrêtée)
- **Flagship = l'usine construisant le produit compléments de A à Z** (le flagship ET la première démo niche = le même run). Choix explicite.
- **Puis** une démo par type de niche, réutilisant le moteur.

## L'identité
**Memo Labs = l'usine à produit agentique.** Une pièce "Lab" phare sur memolabs.dev. C'est à la fois :
- le **flex ultime d'agentic engineer** pour la recherche d'emploi (objectif n°1 : CDI remote) ;
- le **cœur réutilisable** d'un futur produit, retargetable par niche.

## La doctrine du cœur réutilisable (héritée de sku-regulator)
- **Le modèle propose, l'humain (et le code) disposent.**
- LLM **contraint** aux données réelles (grounding), **jamais inventé**.
- **Human-in-the-loop** sur tout verdict incertain.
- **Sortie déterministe + audit trail.**
Cette doctrine se re-consomme d'un secteur à l'autre : on change la source de vérité et l'expert qui signe.

## Le moteur (fondation technique)
Construit sur **Cordis** (`@cordisjs`, TypeScript) — un runtime de composition dynamique **prouvé** :
- **Effets réversibles** : spawn / kill d'un agent ou d'un outil à chaud, avec annulation propre de tous ses effets (pas de restart, pas de fuite).
- **Coeffects réactifs** : un agent déclare ses dépendances ; il s'active quand elles sont là, se désactive quand un provider part.
- **Hot Module Replacement** : un agent réécrit un outil/agent, ça se swap à chaud ; une auto-modif foireuse se rollback proprement.
Le papier fondateur (Cordis / spatiotemporal composability) vise **explicitement les self-evolving agent harnesses**.

**Prouvé le 2026-08-20, dans Chrome, 13 vérifications sur 13** : Cordis se bundle sous Vite et tourne dans le navigateur (11,4 ko gzip, aucune API native de Node), la réversion se joue en ordre inverse, la cascade maître-enfant fonctionne, le **coeffect réactif fonctionne** (l'agent s'active, se désactive et se réactive tout seul), et la **fabrication de composant à l'exécution** fonctionne. Aucun repli backend ou worker n'est nécessaire. Voir `2-EXECUTION.md` et le rapport de spike.

## Garde-fous
- **Design** : fait dans Claude Design, pas ici. Voir `3-CLAUDE-DESIGN-BRIEF.md`.
- **Ne pas rebuild le runtime** : Cordis EST le noyau de composition.
- **Frugalité** : mode par défaut sans clé ni token, jugement déterministe ; LLM branchable à la demande, pour les niches et les entretiens.
- **Le CDI reste l'objectif n°1** : ce projet doit servir les entretiens quoi qu'il arrive.
