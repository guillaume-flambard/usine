# L'usine agentique

**Un atelier de pré-production pour les équipes qui ont des agents en prod et ont
peur de les changer.** On y rejoue la trajectoire d'un agent qui a échoué, on
**forke la timeline**, on remplace l'agent **à chaud sur la branche**, et on
regarde les deux futurs diverger côte à côte — avant de pousser en prod. La porte
humaine valide ou rejette la branche ; le rejeu déterministe est le time-travel
de l'**état** (pas des logs) ; le graphe live rend la divergence regardable.

C'est la pièce phare de Memo Labs, sur `usine.memolabs.dev`. **Cible produit
courante : `docs/7-MIGRATION.md`.**

Le produit ne démontre pas « une IA qui écrit du code ». Il répond à une peur qui
se paie cher (Gartner : >40 % des projets d'agents annulés d'ici 2027 pour
coût/risque) : **tester le correctif d'un agent sur la vraie trajectoire qui a
planté, en dix secondes, avant de le déployer.** La prouesse — forker, remplacer
à chaud, revenir en arrière proprement sous une porte humaine — est la thèse de
*A Programming Paradigm for Spatiotemporal Composability* (Shi, Zhang, Cui —
PKU / DeepSeek-AI), dont Cordis est l'implémentation. Toute décision se juge à
l'aune de ça : si un changement rend cette démonstration moins visible ou moins
regardable, il coûte plus qu'il ne rapporte.

**Deux garde-fous d'honnêteté, à ne jamais transgresser (voir `docs/7`) :**

1. **Le rollback est *intra-runtime*.** Il restaure la composition de l'agent —
   **pas** les effets de bord externes (une base supprimée, un e-mail parti, un
   virement émis). On ne laisse jamais croire l'inverse. On se différencie sur
   l'axe du temps : **prévenir avant** (porte humaine + branche sandbox pour
   prévisualiser l'action irréversible), pas *réparer après*.
2. **Jamais « plateforme de fiabilité » ni « control plane ».** L'éval /
   observabilité est un cimetière surcapitalisé, le control plane est revendiqué
   par les hyperscalers. On tient **une primitive** — réversibilité runtime +
   fork visuel — pas une plateforme. Le fork/hot-swap est le wahou de démo ; le
   marché prouvé est la simulation/qualité d'agents. Ne pas confondre les deux.

L'angle précédent — « l'application qui mue » (`docs/5-ANGLE.md`) — est **passé
au second plan** : ses primitives (rejeu déterministe, hot-swap réversible, porte
humaine, graphe live, harnais d'éval) sont exactement ce sur quoi l'atelier est
bâti. Rien n'est jeté ; le récit change.

## Le premier utilisateur, décidé le 2026-09-10

**Le lab, pas une équipe hypothétique.** Les primitives ne bougent pas — rejeu
déterministe, fork, remplacement à chaud, porte humaine, harnais d'éval. C'est le
destinataire qui se décide, et il existe déjà.

Ce que ce paragraphe corrige : l'atelier décrit plus haut vise « les équipes qui
ont des agents en prod et ont peur de les changer ». Personne de cette
description n'a jamais été rencontré, et cette cible n'est jamais passée par la
porte concurrence du `prospecteur` — celle qui tue 44 % des idées du lab, et dont
l'absence a coûté A Table. Le garde-fou 2 ci-dessus dit lui-même que l'éval et
l'observabilité sont un cimetière surcapitalisé. On ne construit donc pas pour
cet acheteur-là avant de l'avoir mesuré.

**Le trou réel, lui, est documenté, et il est chez nous.**
`lab-infra/scripts/agent-depuis-une-phrase.py` fabrique déjà un agent complet
depuis une phrase : `orchestrateur.py` traduit l'intention en `agent.yaml`,
`agent-neuf.py` en dérive le compose, la sonde et les `group_vars`. Son en-tête
écrit ce qu'il refuse de faire, et pourquoi :

> Il n'écrit pas le jugement. Le squelette lève `NotImplementedError`, ce qui est
> honnête : il refuse de tourner tant que personne n'a décidé ce qu'il pense.

La raison donnée : un agent qui générerait le jugement d'un autre **sans mesure
et sans éval** produirait le genre de code que ce dépôt a corrigé trois fois le
même jour.

**C'est exactement le trou que l'usine remplit, et aucun script ne le remplira :**
écrire les portes d'un agent, les éprouver sur des cas figés, montrer le
raisonnement pendant qu'il se fait, et rendre un verdict avant la livraison. Le
harnais existe déjà en face (`eval-portes.py`, `cas-portes.json`,
`dataset-portes.py`) ; la boucle se referme.

Second trou, mesuré, dans `stacks/debouche/agent.yaml` : « le compose généré sera
ensuite complété **à la main** avec les montages que le gabarit ne connaît pas ».
Chaque nouvel agent demande une finition manuelle.

### Le partage, à ne pas franchir

Une seule source de vérité par domaine, comme partout ailleurs :

| domaine | qui le détient |
|---|---|
| intention → `agent.yaml` → stack | `lab-infra` (`orchestrateur.py`, `agent-neuf.py`) |
| déploiement et exécution 24/7 | `lab-infra` (autodeploy, systemd, compose) |
| **écrire et prouver le jugement** | **l'usine** |

L'usine **ne refait pas** le générateur : ce serait une seconde autorité sur la
génération de stacks. L'usine **ne fait pas tourner** les agents du lab : ils sont
en Python sur le VPS, elle est en TypeScript dans un navigateur, et deux familles
d'agents qui vivent aux deux endroits est précisément le nœud qu'on évite.

Ce qu'elle rend : une PR sur `lab-infra` qu'un humain approuve.

### Ce que ça n'est pas

Ce n'est pas un renoncement à vendre. C'est l'ordre : **un utilisateur réel
d'abord, un acheteur ensuite, et la porte concurrence entre les deux.** Un
atelier qui a fabriqué et prouvé les portes de dix agents en production a une
démonstration que personne ne peut contester ; un atelier qui vise une peur
supposée n'a qu'une thèse.

## Manifest

`name · path · family · status · stack · Vault note`

`usine · ~/projects/usine · Memo Labs · active · Vue 3 / TS / Vite / Cordis + services/{api,relay} · memory usine-project`

> Le chemin canonique est `~/projects/usine`; il ne dépend plus du statut ou de
> la catégorie. Le dépôt est répertorié dans `~/projects/PROJECTS.md`.

## Commandes

```sh
pnpm dev                # le front, port 5173 (ou le suivant libre)
pnpm test               # la suite node
pnpm test:browser       # la suite navigateur (Playwright, lente : ~90 s)
pnpm test:api           # la suite Python
pnpm test:all           # les trois
pnpm lint               # eslint + oxlint + ruff
pnpm type-check         # vue-tsc
pnpm build              # trois entrées : index.html, atelier.html, sandbox.html

# le service compagnon, en local, sur le port que le proxy Vite attend
cd services/api && set -a && . ../../.env && set +a \
  && uv run --extra dev uvicorn usine_api.app:create_app --factory \
     --host 127.0.0.1 --port 3111
```

`.env` (non versionné) porte `OPENROUTER_API_KEY`. Sans lui, le service
s'annonce sans clé et la page rejoue un run enregistré.

## Langue

**Le code est en anglais, sans exception** : identifiants, noms de fichiers,
types, commentaires, descriptions de tests, classes CSS, attributs `data-`.

**Reste en français** ce qui s'adresse à un humain francophone : libellés
d'interface, narration, invites envoyées au modèle, messages de commit, et la
documentation de `services/api` (elle a été écrite en français, gardez-la
cohérente plutôt que de la mélanger).

## Architecture, en cinq règles

1. **Seul `src/runtime/` importe cordis.** Une règle ESLint le tient, et un
   test exécute le linter pour s'en assurer. Tout le reste consomme un flux
   `RunEvent` typé, réduit dans un modèle de lecture.
2. **Le flux d'événements est le format d'archive.** Un événement ne référence
   jamais un objet vivant et ne porte jamais de date absolue — seulement `at`,
   le temps écoulé depuis le début du run. Un run exporté puis rejoué reproduit
   le même modèle de lecture, sans noyau et sans modèle. Toute information dont
   l'écran a besoin doit être dans le flux, sinon un rejeu l'aura perdue.
3. **Le code écrit par un modèle ne s'exécute jamais sur le fil de la page.**
   Il tourne dans un Web Worker dont les capacités réseau ont été retirées du
   realm, et qu'on peut arrêter. C'est la seule défense qui marche contre une
   boucle infinie, et c'est ce qui rend le partage d'un run envisageable.
4. **L'état du visiteur vit hors de tout ce qui est remplaçable.** Sans ça, un
   remplacement à chaud ne vaudrait pas mieux qu'un redémarrage, et le produit
   mentirait sur son compteur.
5. **Un remplacement prend ou rend la main, jamais entre les deux.** Le noyau
   relâche l'entrée, charge la remplaçante, et si elle échoue, restaure la
   précédente *avec les composants qu'elle avait chargés*.

Le détail est dans `_bmad-output/planning-artifacts/architecture/architecture-usine-2026-08-20/ARCHITECTURE-SPINE.md`
(AD-1 à AD-34). Le PRD est à côté, et `docs/4-STACK.md` situe le projet dans la
stack agents 2026.

## L'interface

Quatre zones, et **pas une de plus** : marque + ligne d'état, conversation,
composeur, scène. L'erreur déjà commise une fois — et à ne pas refaire — est
d'attribuer un bloc visible à chaque nouvelle fonctionnalité ; on est monté à
quatorze avant de refondre.

> **Cible atelier (`docs/7`) :** la scène accueillera **deux panneaux divergents
> côte à côte** (les deux futurs), chacun avec **sa porte** (valide/rejette la
> branche) et un bandeau de comparaison de branches. La divergence se montre
> *dans* la scène, pas dans une cinquième zone.

**La stack UI, depuis le 2026-09-07 : Nuxt UI v4 en mode Vue, dans ses défauts.**
Le produit ne déclare ni couleur, ni police, ni rayon — la bibliothèque les
porte, et les composants s'habillent avec ses classes utilitaires
(`text-muted`, `bg-elevated`, `border-default`). Aucune police n'est chargée :
la pile système est le défaut réel de la bibliothèque, `Public Sans` étant la
police de son site de doc et non du paquet. `src/assets/app.css` ne garde que
ce qu'aucune classe ne dit : le plein écran, la scène et ses feuilles du bas,
et le SVG du graphe. La personnalisation reste à décider, et se décidera sur
cette base propre. Les tests visent des attributs `data-*`, jamais une classe
de présentation.

`_bmad-output/planning-artifacts/ux-designs/ux-usine-2026-08-20/DESIGN.md` porte
les jetons, les composants et les règles d'honnêteté : chaque élément à l'écran
doit être payé par un événement réel du run. Aucun squelette, aucune barre de
progression.

## Les pièges, tous trouvés en production

Ils sont écrits ici parce qu'aucun n'était devinable, et qu'ils reviendront.

- **Le fournisseur sérialise les clés par ordre alphabétique.** Un schéma de
  sortie avec une union discriminée par `type` est donc cassé : le décodeur
  écrit `name` avant `type` et s'enferme dans la branche compatible la plus
  courte. Un `create` devenait un `remove`. Le vocabulaire d'actions passe par
  **le tool calling** — le nom de l'action y voyage hors du corps JSON.
- **Un en-tête HTTP est une ByteString.** Un tiret cadratin dans `x-title` lève
  au moment de l'appel et fait tomber le run entier.
- **Un modèle de raisonnement dépense tout son budget de sortie à réfléchir**
  et rend un contenu vide. Mesuré : deux appels sur trois. D'où
  `reasoning: {enabled: false}`.
- **Un Web Worker a `fetch`**, et la politique du site l'autoriserait vers
  notre propre relais. Les capacités sont retirées du realm — et pas seulement
  de `self` : `fetch` vit sur `WorkerGlobalScope.prototype`.
- **Une iframe sablée sans `allow-same-origin` a une origine opaque**, donc
  `script-src 'self'` n'y correspond à rien et bloquerait notre propre pont. Sa
  politique nomme l'hôte explicitement.
- **Traefik ne route pas vers un conteneur marqué malsain**, et une sonde sur
  `localhost` résolvant en IPv6 face à un nginx en IPv4 produit un 404
  inexplicable.
- **Un PaaS qui renseigne `PORT=80`** faisait entrer le relais en collision avec
  nginx. C'était Coolify, parti depuis ; `RELAY_PORT` reste, et c'est toute la
  raison de son existence — ne pas le « simplifier » en `PORT`.

## Ce qui se fait, et ce qui ne se fait pas

- **Le déploiement est automatique, et Coolify n'existe plus** (supprimé le
  2026-09-03). La chaîne, vérifiée le 2026-09-04 : un push sur `main` déclenche
  `.github/workflows/build.yml` sur le runner auto-hébergé du VPS, qui construit
  l'image **sur place** et la pousse dans le registre local
  (`127.0.0.1:5000/usine:{sha,latest}`). C'est délibéré : le dépôt est privé,
  donc son paquet GHCR le serait aussi, et le VPS ne pourrait pas le tirer sans
  jeton `read:packages`. Ensuite `autodeploy.timer` (toutes les 2 minutes) tire
  `:latest`, sonde, et restaure la version précédente si la sonde échoue. Il n'y
  a rien à faire à la main, et surtout aucune interface à cliquer.
  L'infrastructure vit dans `~/projects/lab-infra` : `make status`,
  `make why app=usine` pour comprendre un déploiement, `make rollback app=usine
  sha=…`, `make logs`.
- **Deux hôtes, une image, et `services/api` n'est servi que sur l'un des deux.**
  `usine.memolabs.dev` est la vitrine publique : nginx y proxifie `/api/*` vers
  le relais Node, qui ne sert que `/health` et `POST /reason`. Donc comptes,
  persistance des runs, partage, corbeille, export, évaluation et RGPD restent
  **éteints sur la vitrine**, et ça ne se voit pas, les clients du front rendant
  `null` sur erreur réseau. Vérification : `curl -o /dev/null -w "%{http_code}"
  https://usine.memolabs.dev/api/runs` (404 = toujours le relais).
  `atelier.memolabs.dev` sert l'écran du produit (`atelier.html`) et **lui seul
  atteint `services/api`**, sur le port 3111 du même conteneur.
- **L'atelier est derrière un mot de passe, et c'est structurel.** Ses routes
  (`/flotte`, `/portes`) n'ont aucune authentification à elles, et son bouton
  « Mettre en service » réécrit dans Langfuse l'invite que les agents utilisent
  en production. La basic auth se pose sur un **routeur** Traefik
  (`usine-auth@file`), d'où l'hôte séparé : un chemin sur le routeur `usine`
  aurait été servi sans le middleware. Secret absent, routeur refusé, écran
  inaccessible — on échoue fermé. Le bloc `server_name _` porte
  `default_server` explicitement : sans le mot-clé, l'hôte par défaut serait le
  premier bloc du fichier, et le jour où l'atelier passerait devant il
  répondrait à tout `Host` inconnu, hors du mot de passe.
- **Ne rien ajouter à `services/relay`** (Node). Il est gelé et sert la
  production actuelle ; toute fonctionnalité va dans `services/api` (FastAPI),
  au contrat HTTP identique. Le gel a **une exception, payée le 2026-09-07** :
  tant qu'il sert la production, il tient le contrat. Les deux relais avaient
  divergé — la page envoyait un vocabulaire d'outils et attendait des appels,
  celui-ci ignorait les deux — donc chaque tour retombait sur le JSON dans le
  texte et échouait au parse (« Expected property name or '}' in JSON at
  position 1 »), sur le site public. Un trou de contrat n'est pas une
  fonctionnalité : il se répare des deux côtés.
- **La clé du fournisseur ne touche jamais le client.** Elle vit dans
  l'environnement du service.
- **Un agent nomme une source ou un serveur d'outils, jamais une adresse.** Un
  site public qui relaie une adresse fournie par un modèle est un proxy ouvert.
- **Les tests d'abord quand le comportement est en jeu.** Chaque piège de la
  liste ci-dessus a son test ; c'est ce qui les empêche de revenir.

## Suivi

Le travail est suivi par BMad dans `_bmad-output/` : PRD, spine d'architecture,
epics, et `implementation-artifacts/sprint-status.yaml`. Les décisions et leurs
raisons sont dans les `.memlog.md` — c'est là qu'on regarde avant de défaire
quelque chose qui a l'air arbitraire.
