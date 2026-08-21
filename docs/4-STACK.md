# Où l'usine se place dans la stack agents

Écrit le 2026-08-21, après lecture de deux cartes de l'écosystème : *The AI
Agents Stack* de Letta (novembre 2024) et *The AI Agents Stack (2026 Edition)*
d'O'Reilly Radar.

Les deux ne disent pas la même chose, et l'écart est lui-même une information :
celle de Letta ne mentionne pas MCP — il n'existait pas — et ne liste ni
évaluation ni observabilité ; celle de 2026 met MCP au centre (« MCP won ») et
donne l'évaluation pour le vrai trou du marché, avec 89 % des équipes en
production qui ont de l'observabilité contre 52 % qui ont des evals.

Ce document dit, couche par couche, ce que l'usine emprunte, ce qu'elle a
écrit, et pourquoi. Il assume ce qu'elle ne fait pas : un manque nommé se
défend, un manque découvert ne se défend pas.

---

## Modèles et inférence

**Emprunté.** OpenRouter, `deepseek/deepseek-v4-flash`. La clé vit dans le
service compagnon, jamais dans le paquet servi — une clé côté client se lit
dans l'onglet réseau et se vide.

Cette couche est celle que les deux cartes donnent pour la plus banalisée. Le
choix du modèle est un réglage : `USINE_MODEL` en variable d'environnement, et
rien dans le code ne suppose lequel.

Un réglage qui n'en est pas un, et qui a coûté un après-midi : `reasoning:
{enabled: false}`. Un modèle de raisonnement dépense tout son budget de sortie
à réfléchir et rend un contenu vide — mesuré, deux appels sur trois revenaient
avec 1200 tokens de raisonnement et pas un caractère.

## Protocole et outils

**Manquant, et au plan.** MCP n'est pas là. C'est le nom le plus reconnaissable
de la carte 2026, et son intérêt propre n'est pas cosmétique : les outils y
sont **découverts à l'exécution**, donc le graphe se construit sur un outillage
que personne n'avait déclaré — ce qui est exactement l'argument du produit.

Il est placé après la route sortante du service parce qu'il la réutilise. Fait
avant, c'est un protocole entier pour aucune capacité nouvelle.

**Ce qui est là.** Le vocabulaire d'actions d'un agent est décrit une fois, en
schéma, et demandé au fournisseur comme une sortie contrainte
([`src/agents/turn-schema.ts`](../src/agents/turn-schema.ts)).

Un choix à expliquer, parce qu'il diverge de ce que Letta recommande : nos
actions ne sont **pas** exprimées en appels d'outils. Elles ne joignent rien
d'extérieur, elles modifient notre propre runtime, et un tour en porte
plusieurs à la fois. Les habiller en outils serait une imitation, pas de
l'interopérabilité. Le schéma d'outils aura son emploi exact avec MCP, où il
est le protocole et non une convention empruntée.

## Mémoire et connaissance

**Minimal, et honnête sur son état.** Postgres avec pgvector est dans la
topologie, la mémoire de run est écrite comme histoire, et rien n'est branché
encore. Ce que les agents partagent aujourd'hui, ce sont des coeffets — des
valeurs publiées sous un nom, lues par ceux qui les déclarent.

La carte 2026 conseille de commencer par un historique de conversation dans
Postgres et un prompt structuré. Nous sommes en deçà, et c'est un manque, pas
une position.

## Frameworks et SDK

**Rien, et c'est le seul choix qu'on défend frontalement.**

Un framework d'orchestration fait déclarer le graphe avant de l'exécuter. On
compile des nœuds et des arêtes, puis on route dedans. C'est précisément ce que
ce produit refuse : le graphe sort du brief, ou il ne veut rien dire. Un run où
les mêmes agents apparaissent quelle que soit la demande est une animation, pas
une usine.

La carte 2026 recommande d'ailleurs la retenue sur cette couche : *« Most teams
pick too much framework. If your agent calls a model and a few tools, you don't
need LangGraph. »*

Ce qui remplace le framework est un **runtime de composition** — Cordis, une
implémentation du paradigme décrit dans *A Programming Paradigm for
Spatiotemporal Composability* (Shi, Zhang, Cui — PKU / DeepSeek-AI). Ce n'est
pas un framework d'agents : c'est un modèle d'effets réversibles et de coeffets
réactifs, et c'est ce qui rend possible la seule chose que le produit montre et
que personne d'autre ne montre — **un système qui se modifie pendant qu'il
sert**.

Letta donne un critère pour juger un framework : *« choose a framework that
makes the context window transparent, since this ultimately is how you can
control the behavior of your agents. »* Notre contexte de tour tient dans un
écran et se lit en entier
([`src/agents/free-agent.ts`](../src/agents/free-agent.ts), `turnContext`).

## Gestion d'état

**Écrit, et c'est la moitié de ce que Letta nomme comme difficile** — *« agents
require state management and tool execution »*.

L'état d'un run est un flux d'événements typés, réduit dans un modèle de
lecture. Ce flux est le **format d'archive** : un run exporté et rejoué
reproduit le même modèle de lecture, sans noyau, sans modèle et sans réseau.

L'état du visiteur — ce qu'il a soumis à l'application, ce qui lui a répondu, et
avec quelle version — vit hors du cadre et hors de tout composant remplaçable.
C'est ce qui donne son sens au remplacement à chaud : sans cela, il ne vaudrait
pas mieux qu'un redémarrage.

## Exécution d'outil et bac à sable

**Écrit, et c'est l'autre moitié.** Letta : *« an agent service that supports
arbitrary tools must use sandboxes (e.g. Modal, E2B) to ensure secure
execution. »*

Notre bac à sable est un **Web Worker**, pas E2B, parce que le produit
s'exécute chez le visiteur : le code écrit par le modèle ne doit pas atteindre
la page qui l'a chargé. Modèle de menace, et ce que la mise en œuvre en fait :

| menace | réponse |
|---|---|
| lire le document, le stockage local, la route du service | le Worker n'y a pas accès |
| joindre le réseau depuis un comportement | `fetch`, `WebSocket`, `XMLHttpRequest`, `importScripts` sont **retirés du realm** avant toute évaluation — un Worker les a, et la politique du site les autoriserait vers notre propre origine |
| boucler à l'infini et geler l'onglet | le Worker est arrêté au dépassement ; c'est la seule défense qui marche, et elle n'existe pas sur le fil principal |
| un run partagé qui exécute du code chez son destinataire | même fil isolé qu'un run vivant : un lien reçu n'est pas un chemin privilégié |

Un outil qui aura besoin du réseau tournera côté serveur, dans un bac à sable —
c'est au plan. Déplacer côté serveur ce qui marche chez le visiteur ajouterait
une latence pour rien.

## Évaluation et observabilité

**L'évaluation est écrite ; l'observabilité ne l'est pas.**

Le harnais tourne sur les runs conservés, sans fournisseur et sans réseau
([`services/api/usine_api/evaluation.py`](../services/api/usine_api/evaluation.py)).
Il rapporte la part de runs ayant servi une application, la part comportant au
moins un remplacement à chaud, le rang médian du premier écran utilisable, le
coût moyen, et le nombre de tours rendus hors forme.

Deux exécutions sur le même jeu donnent le même rapport — sans quoi comparer
deux mesures ne voudrait rien dire.

Un détail qui compte : les mesures lisent un champ `kind` sur les messages, pas
leur prose. Une évaluation qui compterait les refus en cherchant un mot
casserait le jour où quelqu'un reformule une phrase, et casserait en silence.

**Traces OpenTelemetry : au plan, pas faites.** C'est la couche où 89 % des
équipes en production sont, et nous n'y sommes pas.

## Garde-fous

**La couche que la carte 2026 donne pour la moins mûre** — *« no dominant
framework, no established patterns »* — et celle où l'usine a le plus à
montrer :

- une **porte humaine** qui statue sur une application déjà en service, et qui
  dit ce que chaque geste coûte avant le clic ;
- des **budgets** qui bornent un run : agents, profondeur, tours, tokens ;
- un **fil isolé** pour tout code écrit par un modèle ;
- un **retour arrière garanti** : une version fautive rend la main à la
  précédente avec les composants qu'elle avait chargés, et il n'existe pas
  d'état intermédiaire observable ;
- une **capacité bornée par visiteur**, pour qu'un curieux ne prenne pas la
  journée de tous les autres.

## Hébergement d'agents

**Non fait, et écarté pour une raison de fond.**

Letta place au sommet de sa carte les agents comme service : persistants,
reprenables, appelables par API. Nos agents ne survivent pas à l'onglet. Il n'y
a ni multi-locataire, ni API d'agents, ni reprise.

Ce n'est pas un retard : déplacer le run côté serveur ferait regarder une
**vidéo** de la composition au lieu de la composition. Le produit démontre un
système qui se réécrit en servant ; il faut que ça se passe là où le visiteur
regarde. Si ce besoin devient réel, c'est un autre produit.

Ce qui est fait, en revanche : les **runs** survivent. Un run est conservé,
partageable par lien, et rejoué à l'identique — application comprise.

---

## En un tableau

| Couche | État | Ce que c'est ici |
|---|---|---|
| Modèles et inférence | emprunté | OpenRouter, clé côté serveur, modèle en réglage |
| Protocole et outils | **manquant** | MCP au plan ; sortie contrainte par schéma en place |
| Mémoire et connaissance | **minimal** | coeffets entre agents ; pgvector prévu, non branché |
| Frameworks | **délibérément absent** | un runtime de composition à la place, et pourquoi |
| Gestion d'état | écrit | flux d'événements, format d'archive, état hors du remplaçable |
| Exécution d'outil | écrit | Worker durci, arrêtable ; bac à sable serveur au plan |
| Évaluation | écrit | harnais reproductible sur les runs conservés |
| Observabilité | **manquant** | OpenTelemetry au plan |
| Garde-fous | écrit | porte humaine, budgets, isolement, retour arrière, capacité |
| Hébergement d'agents | **écarté** | les runs survivent, les agents non — et c'est un choix |
