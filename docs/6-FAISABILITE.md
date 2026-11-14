# 6 — Faisabilité et go/no-go : faut-il muer le projet, et comment

> **Historique v1.** Ce document décrit l'usine avant la refonte v2. Il est
> gardé pour la trace des décisions, mais ne fait plus autorité là où il parle
> de Cordis, du Web Worker, du relais Node ou du refus des frameworks. La cible
> est fixée par `docs/adr/0001-adopter-les-frameworks-agentiques-du-marche.md`
> (14 novembre 2026), et le backlog est dans Linear (projet « Usine v2 »).

> Écrit le 2026-08-24, après une deep search honnête — croisant tes propres
> artefacts (spike, architecture, code réel) et de la recherche externe sur trois
> axes : la **demande**, la **faisabilité technique**, et la **valeur pour
> l'objectif n°1 (le CDI remote)**. Ce document a le droit de dire non. Sur un
> point, il le dit.

---

## La question, précisée

« Est-ce que ça vaut le coup » cache trois questions différentes, et elles n'ont
pas la même réponse. Les mélanger, c'est ce qui fait tourner en rond.

1. **Est-ce un produit vendable ?** → Non, ou très risqué.
2. **Est-ce faisable techniquement ?** → Oui, et plus avancé que tu ne le crains.
3. **Est-ce que ça sert l'objectif n°1 (décrocher le CDI) ?** → Oui, mais seulement muté.

Le reste du document tient ces trois fils séparés.

---

## Ce que la recherche a trouvé

### 1. La demande — faible, et c'est le constat le plus dur à entendre

Le « logiciel malléable » — une application que l'utilisateur modifie ou qui se
réécrit pendant qu'il s'en sert — **échoue commercialement depuis ~40 ans**, de
HyperCard à aujourd'hui. Ses propres champions l'admettent : Ink & Switch écrit
noir sur blanc que leurs prototypes ne sont pas des produits et que le modèle
économique n'est pas résolu ; le fil de discussion de référence conclut que « le
marché a voté au portefeuille pour des *appliances* ».

Pire : ta proposition va **à contre-sens d'une douleur documentée**. Les
utilisateurs *détestent* que leur logiciel change sous eux (aversion au
changement, mémoire musculaire, les colères autour des refontes Trello/Figma).
« Mon outil se réécrit en direct » n'est demandé par personne. Et « sans perte
d'état » n'est pas un argument de vente : c'est une **barre à franchir** pour
être crédible, pas une chose qu'on paie.

Le budget adjacent existe — Retool (~120 M$ ARR), v0, le marché CPQ (3 Md$+) —
mais il paie **la construction rapide d'outils *stables***, pas la mutation en
cours d'usage. Des voix qualifient même l'UI auto-modifiante de « magical
thinking » : une prouesse technique sans marché clair.

**Le seul créneau défendable** : les sessions longues et coûteuses à
reconstruire (configurateurs complexes, analyse/dashboards en session, outils de
spécialistes). Et encore — il faudrait y **cacher que « ça mue »** et ne vendre
que « ton travail survit ». Le pari n'est pas technique, il est de positionnement,
et il est étroit.

> À retenir : ce n'est pas *toi* qui n'arrivais pas à en faire un produit. C'est
> qu'il n'y a pas de marché qui tire. Ton malaise de ce soir était juste.

### 2. La faisabilité — le cœur dur est déjà bâti ; le risque est ailleurs

Ici je corrige la recherche externe, qui estimait « 9–18 mois » sans voir ton
code. En le lisant, une grande partie du plus dur **est déjà faite et testée** :

- `kernel.replace` est implémenté, **verrouillé contre l'entrelacement, et
  testé** ; `performReplacement` restaure la version précédente *avec ses
  composants* si la remplaçante échoue. La garantie de réversion est réelle, pas
  promise.
- Cordis tourne dans le navigateur (spike 13/13, 11,4 ko gzip, zéro API Node).
- Le rejeu déterministe, l'isolement du Worker (globals réseau *retirés du
  realm*, prouvé par capture), la porte humaine, le payoff qui classe un texte
  saisi : tout ça a des tests navigateur qui passent.

Donc « peux-tu le construire » est **déjà largement répondu — oui**. Le mot qui
reste non prouvé n'est pas *faisable*, c'est *robuste* et *tenu dans le temps*.
Les vrais risques :

- **Le socle bouge sous toi.** `cordis@4.0.0-rc.8` : release candidate, un seul
  mainteneur, API « peut changer sans préavis », validée surtout en v3 par
  Koishi, jamais en navigateur (ton terrain défriché). Un breaking change du
  loader ou un repivot du mainteneur, et tu hérites d'un fork. *Parade : épingler,
  vendoriser, être prêt à maintenir.*
- **La continuité d'état est une propriété *globale*, pas un composant.** Rien ne
  l'automatise : une seule donnée qui fuit dans un composant remplaçable casse le
  rejeu et le hot-swap — en silence, visible seulement en prod. *Parade : un test
  de rejeu qui échoue si le modèle de lecture diverge — tu l'as déjà, garde-le
  impitoyable.*
- **La frontière de sécurité s'est déplacée vers le pont.** `unsafe-eval` (tu as
  retenu la voie par évaluation) + `postMessage` + un relais qui a le réseau : la
  surface d'exfiltration, c'est le code du pont, pas le Worker. *Parade : traiter
  le pont comme du code de sécurité, le figer, l'auditer.*
- **Non prouvé, à mesurer tôt, pas à supposer** : la tenue à ~40 composants
  vivants sous churn (fuite mémoire lente via un disposer imparfait), le HMR réel
  (`plugin-hmr` pas installé), le comportement en **échec d'activation** — or
  c'est *là* que la promesse de continuité se gagne.

Et le client-only : il tient pour **la classe d'apps que la démo fabrique** (état
local, transformation de ce que le visiteur tape). Il **ne tient pas** pour « une
vraie app utile » qui voudrait données réelles, MCP réseau, persistance partagée
— tout ça force le backend. L'angle survit s'il reste « une usine à outils qui
muent sous tes yeux » ; il tombe s'il promet « remplace un vrai SaaS ».

### 3. La carrière — le projet est bâti sur les mauvais signaux pour l'embauche

Le marché de l'agentic/AI engineer remote est **réel et sous-approvisionné** en
2026 (gap ~3:1, +57 % d'offres YoY en Europe, remote encore ouvert). Mais la
barre monte, et ce qui **convertit** en embauche n'est *pas* l'originalité :

- des **évals** (le signal n°1 : « la preuve qu'on a vraiment construit avec des
  LLM »), de l'**observabilité/tracing** (Langfuse/LangSmith), des **chiffres**
  coût/latence/recall ;
- des **faits publics horodatés** : une PR mergée dans LangGraph, un serveur MCP
  publié au registry ;
- un **système livré à de vrais utilisateurs** sous contraintes réelles.

Ton projet, tel quel, coche surtout la colonne « inquiète » d'un hiring manager :
un **runtime obscur** (Cordis) sur une **thèse académique pointue**
(composabilité spatiotemporelle), qui ne matche **aucune stack screenée**
(LangGraph, MCP, evals, RAG), sans évals visibles ni utilisateurs chiffrés. Un
moteur maison exotique **inquiète autant qu'il impressionne** : il suggère un
profil qui préfère réinventer que s'insérer. Le conseil dominant 2026 est
unanime : **profondeur sur une spécialité demandée + projets évalués + vrais
utilisateurs**, pas « une startup IA » maison.

---

## Le verdict, sans détour

- **Comme produit à vendre : non** (ou pari étroit et lent). La demande n'est pas
  là, l'histoire du logiciel malléable est un cimetière, et le positionnement se
  bat contre la psychologie de l'utilisateur. N'y mets pas ton pain.
- **Comme faisabilité : oui**, et tu es plus loin que tu ne le penses. Le cœur
  réversible est bâti et testé. Ce qui reste, c'est du durcissement sur un socle
  qui bouge — gérable, si tu épingles et si tu ne promets pas l'universalité.
- **Comme moyen d'atteindre le CDI : oui, mais seulement muté.** Dans sa forme
  actuelle, il te dessert plus qu'il ne te sert. Recadré, il devient un atout.

---

## La mutation recommandée — comment faire muer le projet correctement

L'ironie est belle : le projet dont la thèse est « muer sans rien perdre » doit,
lui-même, muer sans rien perdre. On ne jette pas le code. On change ce qu'il
**démontre** et **à qui**.

1. **Abandonne l'ambition « SaaS vendable ».** C'est elle qui te faisait tourner
   en rond ce soir. Arrête de chercher le métier à facturer ; il n'y en a pas de
   bon.
2. **Recadre-le en preuve des compétences que les recruteurs lisent.** Tu as déjà
   presque tout sous la main, mal mis en avant :
   - **les évals** — `services/api/.../evaluation.py` existe : rends-le visible,
     avec un tableau de métriques (part de runs servant une app, part avec
     hot-swap, rang du premier écran utilisable, coût moyen). C'est *le* signal n°1.
   - **l'observabilité** — les traces OpenTelemetry sont « au plan » : fais-les.
     C'est la couche où 89 % des équipes prod sont, et pas toi.
   - **les chiffres** — coût par run, latence du premier écran (tu as déjà
     l'exigence FR-073), tenue mémoire sous churn.
   - **la discipline de sécurité** — Worker sans réseau, CSP, vocabulaire
     d'action en tool-calling : c'est du « guardrails/production » vendable.
     Raconte-la comme telle.
   - **Le narratif d'entretien devient** : « voici comment j'évalue et je fiabilise
     un système agentique non déterministe » — pas « voici mon runtime ».
3. **Mets-le devant de vrais utilisateurs.** `usine.memolabs.dev` + 20–50
   personnes + métriques d'usage = tu passes de « projet ambitieux » à « système
   livré ». C'est le basculement décisif.
4. **Extrais-en des faits publics horodatés** — ce sont eux qui convertissent, pas
   le moteur : un **serveur MCP** publié au registry, une **PR** sur LangGraph ou
   un outil d'éval, et un **post technique** sur un de tes pièges (la sérialisation
   alphabétique des clés qui transformait un `create` en `remove` est un excellent
   contenu « senior »).
5. **Ne le laisse pas tout manger.** Le gros du temps va à 2–3 livrables plus
   petits, alignés sur les stacks demandées (LangGraph / MCP / évals), avec
   utilisateurs et chiffres. L'usine devient ta pièce « profondeur système »,
   racontée *après* que le recruteur a vu les signaux qu'il sait lire.
6. **Le pari produit, s'il revient un jour** : un seul créneau défendable — les
   sessions longues coûteuses à reconstruire — vendu comme *continuité de travail*,
   pas comme *auto-modification*. C'est un « plus tard, peut-être », jamais avant
   le CDI.

---

## Ce qu'on ne jette pas

Le code n'est pas le problème — c'est de la vraie ingénierie, rare pour un projet
solo : un noyau de remplacement à chaud verrouillé et réversible, un rejeu
déterministe, un fil isolé prouvé, une porte humaine, un harnais d'éval
reproductible. **C'est ta substance embauchable.** La thèse « un système qui se
modifie pendant qu'il sert » reste ton histoire de profondeur — tu la racontes en
dernier, une fois posés les signaux que le recruteur attend. Le moteur ne se vend
pas ; ce que tu as appris en le construisant, si.

---

## Sources

Demande : [Ink & Switch — Malleable Software](https://www.inkandswitch.com/essay/malleable-software/) · [HN — « want appliances »](https://news.ycombinator.com/item?id=44237881) · [HyperCard « la révolution perdue »](https://medium.com/@avonliden/hypercards-legacy-the-revolution-we-lost-2819ca0b63ac) · [Register — backlash refonte Trello](https://forums.theregister.com/forum/all/2025/08/06/trello_redesign_as_bad_as/) · [Axbom — generative UI « magical thinking »](https://axbom.com/nielsen-generative-ui-failure/) · [Retool ARR (Sacra)](https://sacra.com/c/retool/) · [CPQ market (Mordor)](https://www.mordorintelligence.com/industry-reports/configure-price-and-quote-cpq-market) · [apps IA qui perdent l'état (MindStudio)](https://www.mindstudio.ai/blog/why-ai-generated-apps-fail-in-production)

Faisabilité : [cordiverse/cordis (GitHub)](https://github.com/cordiverse/cordis) · [Cordis — limites honnêtes du papier](https://redreamality.com/blog/cordis-spatiotemporal-composability-deepseek-harness/) · [remio — « DeepSeek is the real story »](https://www.remio.ai/post/cordiverse-cordis-hit-github-trending-but-deepseek-is-the-real-story) · [live coding / hot code swapping](https://dev.to/vaibhavee_singh89/live-coding-hot-code-swapping-updating-a-running-program-without-restarting-it-35f9) · [exécuter du JS non fiable (Meziantou)](https://www.meziantou.net/executing-untrusted-javascript-code-in-a-browser.htm) · [CORS / MCP navigateur](https://agentcat.com/guides/implementing-cors-policies-web-based-mcp-servers/)

Carrière : [AI Engineer demand 2026 (gap 3:1)](https://www.futureproofing.dev/resources/ai-talent-gap/ai-engineer-demand-2026) · [Europe hiring 2026](https://predictleads.com/blog/ai-engineering-jobs-in-europe-2026-hiring-report/) · [herohunt — recruter des agent engineers](https://www.herohunt.ai/blog/how-to-recruit-ai-agent-engineers-in-2026/) · [skills that matter (evals n°1)](https://www.digitalapplied.com/blog/ai-developer-hiring-skills-that-matter-2026) · [portfolio projects qui convertissent](https://arslandg.substack.com/p/3-portfolio-projects-that-actually) · [field guide (take-homes réels)](https://github.com/alexeygrigorev/ai-engineering-field-guide)
