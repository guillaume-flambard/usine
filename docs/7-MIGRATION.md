# 7 — La cible de migration : l'atelier de pré-prod qui forke la timeline

> **Historique v1.** Ce document décrit l'usine avant la refonte v2. Il est
> gardé pour la trace des décisions, mais ne fait plus autorité là où il parle
> de Cordis, du Web Worker, du relais Node ou du refus des frameworks. La cible
> est fixée par `docs/adr/0001-adopter-les-frameworks-agentiques-du-marche.md`
> (14 novembre 2026), et le backlog est dans Linear (projet « Usine v2 »).

> Écrit le 2026-08-24. Deep search dédiée à une question : dans quoi faire migrer
> le projet pour croiser **effet wahou (vitrine) × besoin réel × forte
> rentabilité**, en réutilisant ce qui est déjà bâti. Trois recherches menées en
> parallèle — flux d'investissement agentic, croisement wahou/réutilisation,
> analyse concurrentielle de la fiabilité d'agents — ont convergé, sans se
> parler, sur **la même cible**. Quand trois angles indépendants tombent au même
> endroit, on écoute.

---

## La cible, en une phrase

> **Un atelier de pré-production où l'on rejoue la trajectoire d'un agent qui a
> échoué, on forke la timeline, on change l'agent à chaud sur la branche, et on
> regarde les deux futurs diverger côte à côte — avant de pousser en prod.**

La porte humaine devient « valide ou rejette cette branche ». Le rejeu
déterministe devient le time-travel de l'**état** (pas des logs). Le graphe live
rend la divergence *regardable*. Argument de vente : *« teste le correctif d'un
agent sur la vraie trajectoire qui a planté, en dix secondes, avant de le
déployer. »*

---

## Pourquoi elle coche les trois cases

### Wahou — et c'est **ton** wahou, pas un emprunté

Les plateformes de simulation d'agents qui lèvent de l'argent (Patronus, Maxim,
Salesforce eVerse) simulent surtout par **personas multi-tours et scénarios**.
Le panorama du marché note explicitement que **le « forking » et le « sandbox »
ne sont PAS mis en avant** comme différenciateurs. Or forker une timeline,
remplacer un agent à chaud et faire diverger deux futurs en direct, c'est
*exactement* ce que ton stack fait nativement — et c'est spectaculaire à
regarder. Voir = comprendre = acheter. (À l'inverse, le time-travel debugging
« je relis une trace » est devenu **table-stakes** — Braintrust, Phoenix,
Helicone le font tous ; ce n'est plus un wahou. Ton rejeu, lui, reconstruit
l'**état vivant**, pas des logs : c'est la nuance qui te sauve.)

### Besoin réel à forte rentabilité — l'argent frais rentre *exactement* là

- **Patronus AI lève 50 M$** (Série B, Lightspeed/Datadog) pour un « Digital
  World Model » qui **simule des environnements où les agents s'entraînent avant
  déploiement**.
- **Salesforce eVerse** : environnement de simulation pour tester les agents
  *avant* déploiement. Quand Salesforce ouvre la catégorie, le budget existe.
- **La demande est chiffrée** : 57 % des orgs ont des agents en prod, et **la
  qualité est le frein n°1 (32 %)**.
- **La peur est chiffrée** : Gartner prédit **>40 % des projets d'agents
  annulés d'ici fin 2027**, coût et risque en tête ; les incidents d'action
  irréversible sont documentés (un agent qui supprime une base de prod **en 9
  secondes**, sans retour possible).

Tu n'entres pas sur un marché à créer : tu entres sur un budget qui se vote
*maintenant*, sur le frein n°1 (qualité) et la peur n°1 (irréversibilité) en même
temps.

### Réutilisation forte — tu as déjà construit le moteur

| Ce que la cible demande | Ce que tu as déjà, bâti et testé |
|---|---|
| Forker une timeline | rejeu déterministe (le flux d'événements *est* l'archive) + hot-swap |
| Changer un agent sur la branche | `kernel.replace` verrouillé, réversible, testé |
| Exécuter en sécurité le code testé | Worker durci, capacités réseau retirées du realm |
| Trancher une branche | la porte humaine (human-in-the-loop) |
| Rendre la divergence lisible | le graphe live |
| Mesurer quelle branche est meilleure | le harnais d'éval reproductible |

C'est le meilleur alignement des cinq pistes étudiées. (Le digital twin
d'opérations a de plus gros budgets encore — mais son wahou vient de la
3D/physique/données ERP, pas de tes primitives : mauvaise réutilisation, à
éviter en direct.)

---

## Le fossé, et pourquoi les gros ne te laminent pas

Le trou le plus franc du marché, validé par trois sources indépendantes : **la
réversibilité garantie comme primitive *runtime*.** Rubrik (« Agent Rewind »)
l'attaque depuis la couche data-protection, *après coup*. Les checkpoints de
LangGraph/CrewAI/Temporal sont des points de sauvegarde qui **ne garantissent
pas** l'annulation d'un effet — c'est documenté comme « un trou architectural,
pas un produit clé en main ». Le hot-swap d'un agent vivant sans perte d'état
n'est productisé nulle part. **C'est précisément la pièce que Cordis / ta thèse
font mieux que quiconque.**

Le point d'entrée réaliste pour un solo n'est **pas** une plateforme, c'est **une
primitive** : une **librairie open-source d'effets réversibles / compensating
actions pour les tool-calls d'agent**, branchée sur **LangGraph** et **MCP**.
C'est le seul endroit où tu n'affrontes ni un incumbent à 1 Md$ ni un
hyperscaler — et c'est la pièce load-bearing de ta thèse. L'atelier de pré-prod
est le **produit-vitrine** ; la librairie réversible en OSS est le **moat** qui
le rend crédible.

---

## Les deux mensonges à ne jamais dire

L'honnêteté ici n'est pas une posture, c'est ce qui t'évite de te faire démonter
en démo devant un acheteur technique.

1. **Ton rollback est *intra-runtime*.** Il restaure la composition de l'agent —
   pas les effets de bord externes (une base supprimée, un e-mail parti, un
   virement émis). Ne laisse jamais croire l'inverse. Différencie-toi de Rubrik
   sur l'axe du temps : Rubrik *répare après* ; toi tu *préviens avant* — porte
   humaine + branche sandbox pour prévisualiser l'action irréversible. « Empêcher »
   se démontre mieux que « réparer », et c'est honnête. (Si un jour tu veux
   vraiment annuler des effets externes, c'est une couche de compensation/sagas à
   bâtir — le stack ne l'a pas nativement.)
2. **Ne te positionne jamais en « plateforme de fiabilité » ni en « control
   plane ».** L'éval/observabilité est un **cimetière surcapitalisé** (LangSmith,
   Braintrust, Arize, Galileo entre 0,5 et 1,25 Md$, avec de l'OSS gratuit au
   fond du marché) ; le « control plane » est revendiqué par Microsoft, Google et
   Anthropic à la fois. Y entrer de face, c'est se faire laminer. Tu tiens **une
   primitive que personne ne fait proprement**, pas une plateforme.

---

## Comment migrer, concrètement

1. **Recadre l'usine en atelier de pré-prod.** Le brief ne dit plus « construis
   un outil » mais « importe/rejoue une trace d'agent qui a échoué ». Le run ne
   fabrique plus une app : il **forke la trajectoire**, applique un correctif à
   chaud, et montre les deux futurs. Tout ton moteur sert, rien n'est jeté — c'est
   la même mécanique pointée sur un autre récit.
2. **Extrais le moat en OSS.** Sors la primitive d'effets réversibles / undo
   garanti comme librairie, intégrée LangGraph + MCP. C'est à la fois le
   différenciateur produit **et** le « fait public horodaté » (paquet publié, PR
   mergée) qui sert directement l'objectif CDI.
3. **Branche les signaux que les recruteurs lisent** (cf. `docs/6-FAISABILITE.md`)
   : rends visibles ton harnais d'éval, l'observabilité/rejeu, des chiffres
   (coût/latence, taux de branches validées). Le narratif devient « voici comment
   je fiabilise un système agentique non déterministe ».
4. **Vise l'acheteur qui a la douleur** : les équipes qui ont déjà des agents en
   prod et **ont peur de les changer**. C'est le frein n°1, et il a un budget.

---

## Le bonus qui aligne tout

Cette migration résout la tension de `docs/6-FAISABILITE.md` : elle est bâtie sur
les stacks que les recruteurs screenent (agent reliability, LangGraph, MCP,
éval, human-in-the-loop, guardrails), elle est **démontrable en entretien** (le
wahou du fork en direct), et la librairie réversible OSS est *pile* le fait
public horodaté qui convertit. Autrement dit : **la même migration sert le produit
vendable, la vitrine wahou, et le CDI.** C'est la première direction où les trois
objectifs cessent de se contredire.

---

## Les risques, gardés en tête

- **Le wahou du hot-swap est un atout de démo, pas un marché prouvé.** Le marché
  prouvé, c'est la **simulation/qualité d'agents** ; le hot-swap est ce qui te
  rend mémorable dedans. Ne confonds pas les deux.
- **La catégorie a des incumbents frais** (Patronus, Salesforce eVerse). Tu
  n'entres pas frontalement en « plateforme de simulation » : tu entres par le
  **wedge** (réversibilité OSS) + le **wahou** (fork visuel) sur un créneau
  qu'ils ne mettent pas en avant.
- **Les effets externes réversibles restent à bâtir** si tu veux un jour dépasser
  le « prévenir avant ». À nommer, pas à cacher.

---

## En une phrase

Le marché ne paie pas pour « un logiciel qui mue ». Il paie, et massivement, pour
**ne pas avoir peur de ses agents** — et ta seule vraie prouesse (forker,
remplacer à chaud, revenir en arrière proprement, sous une porte humaine) est
exactement ce qui rend cette peur regardable et gérable, en direct.

---

## Sources

Argent / catégorie : [Gartner — dépense IA 2026 +47 %](https://www.gartner.com/en/newsroom/press-releases/2026-05-19-gartner-forecasts-worldwide-ai-spending-to-grow-47-percent-in-2026) · [KPMG Global AI Pulse](https://kpmg.com/xx/en/media/press-releases/2026/03/kpmg-global-ai-pulse-survey.html) · [Patronus AI lève 50 M$ (simulation d'agents)](https://thetopvoices.com/story/patronus-ai-raises-dollar50m-to-advance-ai-agent-simulation) · [Salesforce eVerse](https://www.salesforce.com/news/stories/everse-announcement/) · [Maxim — simuler des agents](https://www.getmaxim.ai/articles/top-5-platforms-to-simulate-ai-agents-to-ensure-production-reliability-in-2026/) · [Gartner — 40 % des projets d'agents annulés d'ici 2027](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027) · [Zenity — agent supprime une base en 9 s](https://zenity.io/blog/current-events/ai-agent-database-deletion-pocketos)

Concurrence / fossé : [Braintrust — debug d'agents (le replay est table-stakes)](https://www.braintrust.dev/articles/best-ai-agent-debugging-tools-2026) · [Rubrik Agent Rewind](https://www.rubrik.com/insights/ai-issues-take-control-with-rubrik-agent-rewind) · [Diagrid — les checkpoints ne sont pas de la durabilité](https://www.diagrid.io/blog/checkpoints-are-not-durable-execution-why-langgraph-crewai-google-adk-and-others-fall-short-for-production-agent-workflows) · [le problème du data-rollback agentique](https://tianpan.co/blog/2026-04-20-ai-agent-data-rollback-production) · [éval saturé — LangChain 1,25 Md$](https://techcrunch.com/2025/10/21/open-source-agentic-startup-langchain-hits-1-25b-valuation) · [Braintrust 800 M$](https://siliconangle.com/2026/02/17/braintrust-lands-80m-series-b-funding-round-become-observability-layer-ai/) · [Check Point rachète Lakera ~300 M$](https://www.calcalistech.com/ctechnews/article/rj5bc1vige) · [observabilité d'agents 0,4→7,1 Md$](https://www.astuteanalytica.com/industry-report/ai-agent-observability-market)
