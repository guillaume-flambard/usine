# L'usine agentique

Une page où un visiteur écrit un besoin et regarde des agents — qui n'existaient
pas — faire naître une application utilisable en quelques secondes, puis **la
remplacer à chaud pendant qu'il s'en sert**, sans qu'il perde ce qu'il a fait.

C'est la pièce phare de Memo Labs, sur `usine.memolabs.dev`.

Le produit ne démontre pas « une IA qui écrit du code ». Il démontre **un
système qui se modifie pendant qu'il sert** — la thèse de *A Programming
Paradigm for Spatiotemporal Composability* (Shi, Zhang, Cui — PKU / DeepSeek-AI),
dont Cordis est l'implémentation. Toute décision se juge à l'aune de ça : si un
changement rend cette démonstration moins visible, il coûte plus qu'il ne
rapporte.

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
- **Coolify renseigne `PORT=80`**, ce qui faisait entrer le relais en collision
  avec nginx. D'où `RELAY_PORT`.

## Ce qui se fait, et ce qui ne se fait pas

- **Ne jamais déployer hors de Coolify.** Le déploiement est décrit dans
  `deployment/` et dans la mémoire projet.
- **Ne pas faire évoluer `services/relay`** (Node). Il est gelé et sert la
  production actuelle ; toute correction va dans `services/api` (FastAPI), au
  contrat HTTP identique. Deux relais au même contrat finiraient par diverger.
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
