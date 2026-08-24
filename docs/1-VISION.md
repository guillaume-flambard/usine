# Memo Labs — L'usine agentique · Vision

> **Repositionné le 2026-08-24 (voir `5-ANGLE.md`).** L'angle n'est plus « une
> usine qui construit un produit, et le produit sort à la fin ». C'est
> **l'application qui mue sous l'utilisateur** : elle apparaît en quelques
> secondes, il s'en sert pendant que le run continue, et les agents la refont
> **autour de ce qu'il en fait** — sans qu'il perde ce qu'il a fait. Le hot-swap
> n'est plus le décor du chantier ; c'est la valeur ressentie en usage. Les
> passages ci-dessous qui parlent d'un « payoff à la fin » sont conservés pour
> l'historique, mais lus à travers ce cadre.

## Le pitch en une phrase
Un système agentique qui, à partir d'un besoin, **s'auto-orchestre de bout en
bout** — il se dote d'une mémoire, écrit les specs, se crée ses outils, spawn
d'autres agents qui se connectent, code, vérifie — **et pose en quelques
secondes une application utilisable qu'il continue de refaire à chaud, en
réponse à ce que l'utilisateur en fait, sans jamais lui faire perdre sa
session.**

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

> **Révisé le 2026-08-24.** La valeur n'est plus « un produit livré à la fin » :
> c'est l'application qui sert **pendant** le run et se refait autour de l'usage.
> Le produit reste **brief-agnostique** (voir `5-ANGLE.md`, décision) — pas de
> vérificateur figé connu d'avance. Les couches ci-dessous se relisent ainsi.

1. **La preuve en usage** = le flagship Memo Labs. L'usine pose une application
   utilisable en direct, et l'utilisateur la voit muer sous ses doigts en
   réponse à ce qu'il tape. Le spectacle du graphe reste, mais au second plan :
   le protagoniste est l'application, pas le chantier.
2. **La substance** : ce que l'application fait **fonctionne pour de vrai** —
   code évalué dans un fil isolé, sources réelles branchées, rien de simulé. La
   conformité des allégations reste un cas d'usage exemplaire (adossé au corpus
   réel), mais un cas parmi d'autres, pas la fin obligée du run.
3. **Des démos par niche** ensuite : le même moteur pointé sur d'autres besoins
   (conformité, deal-screening, clinique…), chacune une application réelle qui
   mue autour de son utilisateur.

## Le principe : impressionnant ET pas creux

**Révisé le 2026-08-20.** La version initiale acceptait un milieu simulé pour la vitrine publique. `0-DECISIONS.md` l'a rejeté : le milieu est réel lui aussi.

- Le **milieu** est une **vraie composition** : de vrais composants Cordis qui se chargent, se câblent, fabriquent des composants à l'exécution et se libèrent proprement. Ce qui est déterministe en mode par défaut, c'est le *jugement* des agents — pas leur existence, pas leur travail.
- La **mue est réelle et ressentie** : l'application sert pendant le run, et un remplacement à chaud répond à une interaction réelle du visiteur (l'événement `visitor-interacted` est dans le flux, avant le `component-replaced` qu'il cause). Ce que le visiteur a fait est conservé hors de tout ce qui est remplaçable.
- Rien n'est simulé, et ça reste **gratuit et instantané** : zéro clé, zéro token par visiteur. C'est ce qui fait qu'un recruteur ou un client dit « ok, c'est pas du vent ».

## La décision (arrêtée)
- **Flagship = l'usine posant une application vivante à partir d'un besoin
  quelconque**, et la refaisant à chaud autour de l'usage. Brief-agnostique : le
  besoin conformité en est un exemple fort, pas le seul (révisé le 2026-08-24).
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
