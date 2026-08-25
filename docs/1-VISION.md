# Memo Labs — L'usine agentique · Vision

> **Cible produit repositionnée le 2026-08-24 (voir `7-MIGRATION.md`, qui
> supersede `5-ANGLE.md`).** Le produit n'est plus « l'application qui mue » posée
> à un visiteur, mais **l'atelier de pré-production qui forke la timeline d'un
> agent**. Le client n'est pas un curieux : c'est une équipe qui a des agents en
> prod et **a peur de les changer**. Les passages ci-dessous décrivent le moteur
> (self-orchestration, composition réelle, hot-swap réversible, porte humaine) —
> toujours exacts — mais réorientés vers ce récit : ce moteur sert désormais à
> **rejouer, forker et prévisualiser**, pas à livrer un outil.

## Le pitch en une phrase
Un atelier de pré-prod où l'on **rejoue la trajectoire d'un agent qui a échoué,
on forke la timeline à l'instant du problème, on remplace l'agent à chaud sur la
branche, et on regarde les deux futurs diverger côte à côte** — avant de pousser
en prod. Argument de vente : *« teste le correctif d'un agent sur la vraie
trajectoire qui a planté, en dix secondes, avant de le déployer. »*

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

> **Révisé le 2026-08-24 (cible atelier, `7-MIGRATION.md`).** La valeur n'est ni
> « un produit livré à la fin » ni « une app qui mue » : c'est **le fork visuel
> de deux futurs d'un agent**, sous une porte humaine, avant la prod. Le produit
> reste **agnostique** — n'importe quelle trajectoire d'agent, pas un secteur
> figé. Les couches se relisent ainsi.

1. **La preuve regardable** = le flagship Memo Labs. On rejoue une trajectoire
   qui a planté, on la forke, on change l'agent à chaud sur la branche, et les
   **deux futurs divergent côte à côte** dans le graphe live. Voir = comprendre
   = acheter — et c'est *ton* wahou : forking + sandbox ne sont mis en avant par
   aucun concurrent (Patronus, Salesforce eVerse simulent par personas).
2. **La substance** : le rejeu reconstruit l'**état vivant**, pas des logs
   (le time-travel de traces est devenu table-stakes ; ta nuance te sauve). Code
   évalué dans un fil isolé, réversibilité runtime réelle et testée. Quelle
   branche est meilleure se **mesure** (harnais d'éval, diff de deux rapports).
3. **Des cas par contexte** ensuite : le même moteur pointé sur d'autres
   trajectoires (support, ops, conformité, data…), chacune un fork réel sous
   porte humaine.

## Le principe : impressionnant ET pas creux

**Révisé le 2026-08-20.** La version initiale acceptait un milieu simulé pour la vitrine publique. `0-DECISIONS.md` l'a rejeté : le milieu est réel lui aussi.

- Le **milieu** est une **vraie composition** : de vrais composants Cordis qui se chargent, se câblent, fabriquent des composants à l'exécution et se libèrent proprement. Ce qui est déterministe en mode par défaut, c'est le *jugement* des agents — pas leur existence, pas leur travail.
- La **réversibilité est réelle, pas promise** : un remplacement à chaud prend ou rend la main, et un échec restaure la version précédente avec ses composants (`kernel.performReplacement`). Le fork rejoue l'état, pas des logs. **Mais l'honnêteté d'abord** : ce rollback est *intra-runtime* — il ne défait pas un effet externe (base supprimée, e-mail parti). On **prévient avant** (porte + branche sandbox), on ne *répare pas après* ; se le cacher, c'est se faire démonter en démo.
- Rien n'est simulé, et ça reste **gratuit et instantané** en démo : zéro clé, zéro token par visiteur. C'est ce qui fait qu'un recruteur ou un client dit « ok, c'est pas du vent ».

## La décision (arrêtée)
- **Flagship = l'atelier de pré-prod qui forke la timeline d'un agent** (révisé
  le 2026-08-24, `7-MIGRATION.md`). L'entrée n'est plus « construis un outil »
  mais « importe/rejoue une trace d'agent qui a planté » ; le run **forke** et
  montre deux futurs sous porte humaine. Agnostique : n'importe quelle
  trajectoire, pas un secteur figé.
- **Le moat en OSS** : extraire la primitive d'effets réversibles (undo garanti)
  en librairie, intégrée LangGraph + MCP — le fossé produit *et* le fait public
  horodaté pour le CDI.
- **Puis** d'autres contextes de trajectoires, réutilisant le moteur.

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
