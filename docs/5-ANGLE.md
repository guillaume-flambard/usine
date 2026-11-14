# L'angle — la prouesse et son application

> **Historique v1.** Ce document décrit l'usine avant la refonte v2. Il est
> gardé pour la trace des décisions, mais ne fait plus autorité là où il parle
> de Cordis, du Web Worker, du relais Node ou du refus des frameworks. La cible
> est fixée par `docs/adr/0001-adopter-les-frameworks-agentiques-du-marche.md`
> (14 novembre 2026), et le backlog est dans Linear (projet « Usine v2 »).

> **Superseded le 2026-08-24 par `docs/7-MIGRATION.md`.** L'angle « l'application
> qui mue » a servi à identifier la prouesse (hot-swap réversible + continuité
> d'état). La cible produit est désormais **l'atelier de pré-prod qui forke la
> timeline** : mêmes primitives, récit et marché différents. Ce document reste
> pour l'historique et pour son analyse concurrentielle, toujours valable.

> Écrit le 2026-08-24, après une deep search sur le marché concurrentiel (quinze
> app builders, treize ingénieurs agentiques, les agents généralistes et le
> front « self-evolving », la lignée live-programming de Smalltalk à Cordis).
> Objectif fixé avec Guillaume : trouver **un** angle gagnant, neuf sur deux
> axes — une prouesse dans la **technique agentique** *et* dans son
> **application** — que l'usine peut prouver, avec la thèse du pourquoi elle et
> pas un autre.

---

## Ce qu'on cherchait

Pas une niche verticale de plus, mais le **white space** : ce que le marché,
tout entier, ne fait pas encore — et qui soit à la fois un exploit d'ingénierie
agentique et l'ouverture d'un usage que personne ne sert. La deep search a
balayé quatre familles. Elles convergent sur le même angle mort.

## Le marché, en un regard

- **Les app builders IA** (Lovable ~500 M$ ARR, Base44, Bolt, v0, Replit, Emergent…)
  font tous *generate → edit/regenerate → build → redeploy*. Base44 le dit
  crûment : chaque modification « déclenche un **redéploiement automatique** ».
  La donnée survit **parce qu'elle est en base** ; l'état *transitoire* du
  visiteur — ce qu'il a saisi, où il en est — n'est préservé nulle part. Le HMR
  de Bolt est le seul mécanisme techniquement proche, mais c'est un outil de
  *développement*, dans l'onglet du constructeur, non garanti.
- **Les ingénieurs agentiques** (Devin, Cursor, Claude Code, Copilot, Jules,
  Codex, Factory, Kiro, OpenHands…) livrent, à une exception près, une **pull
  request**. L'exécution vit dans un sandbox **jetable** ; quand un agent
  « teste en live », c'est sur un `localhost` jetable, jamais sur le système qui
  sert de vrais utilisateurs. Le cas le plus proche de la prod — Codex opérant
  la data platform d'OpenAI — reste des PR à relire et du **restart de jobs** :
  précisément le redémarrage que notre paradigme refuse.
- **Les agents généralistes et le front self-evolving** : Manus, Genspark,
  AgentKit rendent un livrable puis s'arrêtent. La recherche sait faire un agent
  qui **se réécrit pendant qu'il travaille** (*Live-SWE-agent*, on-the-fly, 75 %
  SWE-bench) — mais **invisible, sans humain en face, sans rollback traité**. Et
  quand un papier étudie un agent qui se modifie en continu (*Layered
  Mutability*, 2026), il **mesure que le rollback échoue** : ~2/3 de la dérive
  persistent. La réversion propre + la continuité y sont déclarées **problème
  ouvert**.
- **La lignée live-programming** : la brique — modifier le code d'un système en
  marche **sans perdre son état runtime** — existe depuis Smalltalk, Erlang/OTP
  (`code_change`, l'AXD301 et ses « nine nines »), Common Lisp (le patch de Deep
  Space 1 *en vol*, à 100 M de miles). Mais toujours **habitée par des experts**
  ou **cantonnée au poste de dev** (HMR, fragile). Le versant prod moderne
  (feature flags, canary, edge, WASM hot-swap) **route le trafic** et s'appuie
  sur les **données persistées** ; il ne transporte jamais l'**état de session**
  d'une version à l'autre.

## Le quadrant vide

Quatre propriétés. Chacune a un propriétaire. **Personne ne tient les quatre à
la fois.**

| Propriété | Qui la tient déjà | Qui manque le reste |
|---|---|---|
| **1. Un agent fabrique le remplaçant** | app builders, Devin, Live-SWE | livrent une PR / un redeploy, pas un composant vivant |
| **2. Remplacement à chaud réversible** | Erlang, Smalltalk, Lisp, Cordis | infra d'experts, ou framework, pas un produit |
| **3. Continuité de l'état du *visiteur*** | Erlang, Smalltalk (pour l'opérateur) | jamais pour un utilisateur final ; la GenUI régénère et perd tout |
| **4. Orienté utilisateur final, donné à voir** | generative UI, app builders | mais sans (2) ni (3) : ils rendent de l'UI, ne remplacent pas du code vivant |

Le mariage **agent + hot-swap réversible + continuité d'état visiteur + mise en
scène pour l'utilisateur final** est **vacant en août 2026**. Aucun concurrent
nommé ne pose cette revendication produit. C'est le trou.

---

## La prouesse technique

Nommée précisément, pour qu'un manque nommé se défende :

> **La continuité de l'état runtime du visiteur à travers un remplacement de
> code réversible, piloté par des agents, dans une session en cours d'usage.**

Le geste agentique neuf, formulé pour un entretien :

> **Mes agents ne livrent pas une pull request. Ils ne redéploient pas une app.
> Ils livrent un composant *vivant* dans une session en cours — et le
> remplacent à chaud, autant de fois qu'il faut, sans que l'utilisateur perde ce
> qu'il a fait, avec un retour arrière garanti si le remplaçant échoue.**

Ce que ça suppose, et que l'usine a déjà posé comme règles (CLAUDE.md 4 et 5,
AD-5) :

- l'**état du visiteur vit hors de tout ce qui est remplaçable** — sinon un
  hot-swap ne vaut pas mieux qu'un redémarrage ;
- un remplacement **prend ou rend la main, jamais entre les deux** : pas d'état
  intermédiaire observable ;
- en cas d'échec, restauration de la **version précédente *avec les composants
  qu'elle avait chargés*** — le point exact que *Layered Mutability* démontre
  non résolu ailleurs.

C'est là que la lignée intellectuelle sert de preuve, pas de décoration :
Smalltalk et Erlang ont tenu la continuité d'état runtime pour des **opérateurs** ;
Cordis (composabilité spatiotemporelle, Shi/Zhang/Cui, PKU / DeepSeek-AI, 2026)
la **reformalise** — effets réversibles + coeffects réactifs hissés au runtime —
en visant explicitement les *self-evolving agent harnesses*. L'usine prend cette
brique et la porte, pour la première fois, **jusqu'à l'utilisateur final**.

## La prouesse d'application

La technique n'est un exploit que si elle **ouvre un usage**. Le voici.

Tout le marché suppose une frontière nette : d'abord on **construit**, ensuite on
**utilise**. Cette frontière punit une classe entière de tâches — celles où
**l'utilisateur ne peut pas spécifier l'outil à l'avance parce qu'il découvre ce
dont il a besoin en s'en servant**. Aujourd'hui, ces tâches n'ont que deux
options, mauvaises : un outil rigide pré-construit (qui ne colle pas), ou
« regénère depuis zéro » (Lovable & co — et je perds tout ce que j'avais entré).

> **L'application qui mue** — un logiciel qui se réécrit *sous* l'utilisateur,
> se reconfigure autour de ce qu'il est en train de faire, sans jamais lui faire
> perdre sa session. Le seul objet qui épouse une cible mouvante sans punir
> l'utilisateur de ce qu'elle bouge.

Le renversement à retenir — et c'est l'angle que le cadrage actuel n'avait pas
encore nommé : **aujourd'hui le hot-swap est du décor** (il impressionne pendant
que l'usine se construit, puis le produit livré redevient statique). L'angle
gagnant fait du hot-swap **la valeur que l'utilisateur final ressent en usage** :
l'outil mue *autour de lui*, en réponse à ce qu'il tape, et sa promesse propre —
*« ton travail survit à chaque changement »* — est exactement l'invariant que
tout le marché casse.

**Beachhead recommandé (réutilise l'acquis) : le poste de conformité qui se
fabrique autour de ton cas.** On garde ClaimCheck, mais on le repositionne : le
différenciateur n'est plus « il vérifie des allégations » (un vérificateur, une
fois construit, est statique), c'est **« il *devient* le vérificateur que ton cas
précis réclame, en direct »** — le type de produit, le marché, la catégorie
d'allégation se découvrent en session, et l'outil se recompose en conséquence
sans jamais perdre le dossier collé. Enjeu réel, B2B, à forte valeur — donc la
continuité *compte* vraiment. C'est le mariage exact spectacle + substance que la
vision vise déjà, mais avec le hot-swap comme **payoff**, plus comme décor.

Deux alternates, si on veut plus « wahou » grand public que B2B :

1. **L'outil jetable à intention émergente** — une micro-app fabriquée pour une
   seule session, qui s'affine à mesure que tu réalises ce que tu voulais, puis
   jetée. Sans compte, sans déploiement, sans base. Le marché optimise le
   *déploiement durable* (URL, hébergement, stores) et facture au crédit ; il est
   lourd et inadapté pour le jetable. Catégorie la plus neuve, la plus
   démontrable en client-only — mais risque « gadget » à tenir par la substance.
2. **L'analyse qui grandit** — un espace d'exploration qui se dote de nouvelles
   capacités en cours de route (un tableau devient un formulaire, puis un
   classifieur) sans perdre les données déjà saisies. Réel pour un analyste, mais
   voisinage plus encombré (notebooks, BI).

---

## Pourquoi l'usine, et pas un autre

1. **Les incumbents ne peuvent pas suivre sans se renier.** Leur boucle est
   *code → PR → CI → deploy*, ou *regenerate → redeploy*. Le redéploiement **est**
   le redémarrage ; il détruit l'état de session par construction. Adopter la
   continuité d'état runtime, c'est refaire leur architecture, pas ajouter une
   feature. Leur force (déployer vite, durablement) est l'origine de leur angle
   mort.
2. **La recherche la plus avancée s'arrête juste avant.** Live-SWE se réécrit en
   direct mais sans utilisateur ni rollback ; DGM/AlphaEvolve évoluent **offline** ;
   Layered Mutability **prouve** que la réversion naïve échoue. L'usine tient
   précisément les deux garanties qui manquent partout : **réversion qui restaure
   réellement** et **continuité de l'état visiteur**.
3. **La lignée donne la crédibilité, la mise en scène donne la nouveauté.**
   Smalltalk → Lisp (Deep Space 1) → Erlang (nine nines) → HMR → Cordis : cinq
   étapes qui ont fait vivre la modification-à-chaud-avec-continuité pour un
   **opérateur**. Aucune ne l'a rendue **visible et utilisable par un spectateur
   non technique, conduite par des agents**. L'usine est le bout exact de cette
   droite.
4. **La contrainte d'honnêteté est un fossé, pas une gêne.** « Chaque élément à
   l'écran payé par un événement réel du run », zéro clé / zéro token par
   visiteur, composition Cordis réelle et non scriptée : personne ne peut copier
   la *démo* sans copier le *moteur*. C'est ce qui fait qu'un recruteur ou un
   client dit « ok, c'est pas du vent ».
5. **Ça sert l'objectif n°1 sans détour.** Le flex d'agentic engineer et le
   produit réel sont, ici, le même run. L'angle ne demande pas de choisir.

## Ce qu'il reste à prouver (et les risques)

- **La tenue à l'échelle du hot-swap.** Le spike a prouvé réversion, cascade,
  coeffect réactif, fabrication à l'exécution — mais **pas** la tenue à 40 nœuds
  vivants, le **HMR réel**, ni le comportement **en cas d'échec d'activation**.
  Or l'échec d'activation *est* le moment où la promesse de continuité se gagne ou
  se perd. C'est le premier jalon à sécuriser.
- **Le « ratchet problem ».** Layered Mutability montre qu'une réversion peut
  laisser de la dérive. Notre défense (état hors du remplaçable + restauration de
  la version précédente avec ses composants) doit être **testée adversairement**,
  pas supposée. Un test par piège, comme le reste.
- **Le risque « gadget » sur les alternates.** Le jetable et le grand public ne
  tiennent que si la substance suit ; le beachhead conformité l'a nativement,
  d'où sa recommandation en premier.
- **La discipline de périmètre.** L'interface est à quatre zones, « et pas une de
  plus » ; l'erreur déjà commise (quatorze blocs) reviendra si chaque preuve de
  mue réclame son bloc. La mue se montre *dans la scène*, pas dans un panneau de
  plus.

---

## En une phrase

Le marché sait faire naître un logiciel vite ; **personne ne sait le faire muer
sous l'utilisateur sans lui faire perdre ce qu'il fait.** C'est la prouesse
technique (continuité d'état runtime à travers un remplacement réversible piloté
par agent) et l'application qu'elle ouvre (l'outil qui épouse une intention qui se
précise à l'usage) — et c'est le seul territoire où l'usine n'a, aujourd'hui,
personne en face.

---

## Sources

Marché — app builders : [Sacra/Lovable](https://sacra.com/c/lovable/) · [justinmckelvey/Base44](https://justinmckelvey.com/blog/what-is-base44) · [Sailop/Bolt](https://sailop.com/blog/bolt-new-honest-review-2026) · [NxCode/v0](https://www.nxcode.io/resources/news/v0-by-vercel-complete-guide-2026) · [closefuture/Emergent](https://www.closefuture.io/blogs/deep-dive-emergent-ai-vibe-coding-platform) · [Replit Agent 3](https://blog.replit.com/introducing-agent-3-our-most-autonomous-agent-yet) · [Firebase Studio](https://firebase.google.com/docs/studio/get-started-ai)

Marché — ingénieurs agentiques : [Cognition/Devin (idlen)](https://www.idlen.io/news/cognition-devin-25-billion-valuation-windsurf-vibe-coding-april-2026/) · [Cursor background agents](https://aitechfy.com/blog/cursor-background-agents/) · [Forbes/Codex data platform](https://www.forbes.com/sites/victordey/2026/04/17/openai-says-codex-agents-are-running-its-data-platform-autonomously/) · [Factory software factory](https://factory.ai/news/software-factory) · [Jules](https://theaiagentindex.com/agents/jules) · [OpenHands](https://theaiagentindex.com/agents/openhands)

Self-evolving : [Survey — What/When/How/Where (2507.21046)](https://arxiv.org/abs/2507.21046) · [Survey self-evolving agents (2508.07407)](https://arxiv.org/abs/2508.07407) · [Darwin-Gödel Machine (2505.22954)](https://arxiv.org/abs/2505.22954) · [Gödel Agent (2410.04444)](https://arxiv.org/abs/2410.04444) · [Live-SWE-agent (2511.13646)](https://arxiv.org/html/2511.13646v1) · [Layered Mutability (2604.14717)](https://arxiv.org/abs/2604.14717) · [AlphaEvolve](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/)

Live-programming & Cordis : [Cordis paper (cordiverse/paper)](https://github.com/cordiverse/paper) · [Cordis expliqué (redreamality)](https://redreamality.com/blog/cordis-spatiotemporal-composability-deepseek-harness/) · [36kr — DeepSeek self-evolution](https://eu.36kr.com/en/p/3938795963137411) · [Erlang release handling](https://www.erlang.org/doc/system/release_handling.html) · [Lisping at JPL (Deep Space 1)](https://flownet.com/gat/jpl-lisp.html) · [Pharo](https://pharo.org/features) · [React Router — HMR](https://reactrouter.com/explanation/hot-module-replacement) · [LaunchDarkly — progressive delivery](https://launchdarkly.com/blog/what-is-progressive-delivery-all-about/)
