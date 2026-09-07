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

## Manifest

`name · path · family · status · stack · Vault note`

`usine · ~/projects/active/ai/usine · Memo Labs · active · Vue 3 / TS / Vite / Cordis + services/{api,relay} · memory usine-project`

> Moved under `~/projects/active/ai/` by the 2026-08-22 home-map reorg; it used to
> live at `~/usine`, and stale absolute paths from before that date still bite (a
> venv's console scripts, for one). Own repo, cross-listed in
> `~/projects/PROJECTS.md`.

## Commandes

```sh
pnpm dev                # le front, port 5173 (ou le suivant libre)
pnpm test               # la suite node
pnpm test:browser       # la suite navigateur (Playwright, lente : ~90 s)
pnpm test:api           # la suite Python
pnpm test:all           # les trois
pnpm lint               # eslint + oxlint + ruff
pnpm type-check         # vue-tsc
pnpm build              # deux entrées : index.html et sandbox.html

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
  L'infrastructure vit dans `~/projects/active/infra/lab-infra` : `make status`,
  `make why app=usine` pour comprendre un déploiement, `make rollback app=usine
  sha=…`, `make logs`.
- **L'image ne contient que la SPA et le relais Node.** `services/api` (FastAPI)
  **n'est déployé nulle part** : nginx proxifie `/api/*` vers le relais, qui ne
  sert que `/health` et `POST /reason`. Conséquence à connaître avant d'annoncer
  qu'une fonctionnalité est « en production » : la connexion est impossible en
  ligne, donc comptes, persistance des runs, partage, corbeille, export,
  évaluation et RGPD sont **éteints**. Ça ne se voit pas, les clients du front
  rendant `null` sur erreur réseau. Vérification en une commande :
  `curl -o /dev/null -w "%{http_code}" https://usine.memolabs.dev/api/runs`
  (404 = toujours pas déployé).
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
