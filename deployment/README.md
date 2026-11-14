# Déploiement — usine.memolabs.dev

Build statique servi par nginx. Aucune base. Un seul service optionnel — le
relais de raisonnement — qui existe pour garder une clé hors du navigateur.
Sans lui, l'application tourne entièrement dans l'onglet du visiteur, en mode
déterministe.

## Comment l'usine est déployée aujourd'hui (observé le 14 novembre 2026)

En ligne sur **https://usine.memolabs.dev**, derrière Traefik, avec un
certificat Let's Encrypt. Coolify a été supprimé le 2026-09-03. Le runner GitHub
auto-hébergé du VPS (`lab-usine`) et le workflow `build.yml` ont été retirés le
2026-10-13, dans les PR #45 et #47, pour des raisons de sécurité : il n'y a plus
de runner GitHub sur le VPS.

### La chaîne réelle

1. **Vérification sur GitHub.** Le workflow `.github/workflows/verify.yml`
   tourne sur une machine hébergée par GitHub (`ubuntu-24.04`).
2. **Construction sur le VPS par un builder de confiance.** Le timer
   `usine-build-controller.timer` (rôle `ansible/roles/usine-builder` de
   `lab-infra`) passe toutes les deux minutes. Il lit le SHA de `main` par l'API
   GitHub, puis exige un run `verify.yml` **réussi, sur ce SHA exact, avec
   l'événement `push` sur `main`**. Si c'est le cas, il clone, construit et
   pousse `127.0.0.1:5000/usine:<sha>` puis `:latest`, avec le label
   `org.opencontainers.image.revision`. Le dernier SHA publié est dans
   `/var/lib/usine-builder/published.sha`.
3. **Déploiement.** `autodeploy.timer` tire `:latest`, sonde le conteneur et
   restaure la version précédente si la sonde échoue. La stack vit dans
   `/opt/stacks/usine`. Son compose (`lab-infra/stacks/usine/compose.yml`) ne
   route que `usine.memolabs.dev`.

### La chaîne est arrêtée depuis le 2 novembre 2026

Le commit `f52872e` (« push straight to main, no PR gate ») a passé
`verify.yml` en déclenchement manuel seul (`workflow_dispatch`). Aucun run
`push` n'existe plus pour un SHA de `main`, donc le builder attend sans fin :

```text
usine-build-controller: WAIT: CI main not successful for f52872efad639cc4f66f00cca92b8f770a1e5504
```

Ce que la production sert vraiment le 14 novembre 2026 :

| Fait | Valeur |
|---|---|
| Image du conteneur `usine-usine-1` | `sha256:2299d930…`, révision `0439b39` (PR #48), construite le 2026-10-20 |
| `published.sha` du builder | `0439b39c8fc1e4ed822ea6b12a1d1e6919d6d3fb` |
| `https://usine.memolabs.dev/` | 200 |
| `https://usine.memolabs.dev/api/health` | 200 (relais Node) |
| `https://usine.memolabs.dev/api/runs` | 404 : `services/api` n'est pas servi |
| `https://atelier.memolabs.dev/` | aucune réponse TLS : l'hôte n'est pas configuré |

Le seul commit de `main` non déployé ne touche que `verify.yml`, donc la
production ne manque d'aucune fonctionnalité. Mais tout correctif poussé sur
`main` resterait bloqué au même endroit.

Les modifications locales du 12 octobre décrivaient un hôte
`atelier.memolabs.dev` et une API sur le port 3111. Elles n'ont jamais été
commitées ni déployées, et sont gardées sur la branche
`sauvegarde-2026-10-12`.

### Comment le vérifier soi-même

```sh
ssh lab 'journalctl -u usine-build-controller.service -n 3 --no-pager'
ssh lab "docker inspect usine-usine-1 --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}'"
curl -o /dev/null -w "%{http_code}\n" https://usine.memolabs.dev/api/runs
```

## La chaîne cible de la v2

La v2 se construit sur la branche `v2` et ne touche pas la production avant la
bascule (MEM-65). La cible garde ce qui a été payé en sécurité, c'est-à-dire
aucun runner GitHub sur le VPS et un builder qui ne construit que du code
vérifié. Elle corrige le point de rupture.

1. **Staging depuis `v2`.** Le builder accepte une seconde branche, `v2`, et
   publie `127.0.0.1:5000/usine:staging-<sha>`. Une stack `usine-staging` sert
   `usine-staging.memolabs.dev`, derrière une authentification (MEM-59, MEM-60).
2. **Production depuis `main`, après la bascule.** C'est le même builder, sur
   `main`, et le même autodeploy, avec sa sonde et son rollback.
3. **Trois services au lieu d'un** : `web`, `api` et `db` (MEM-58). La stack de
   `lab-infra` passe du conteneur unique au compose du dépôt.
4. **La CI tourne dans le builder du VPS** (décision du 14 novembre 2026, MEM-6).
   Ça respecte la règle du lab (jamais les machines payantes de GitHub) sans
   remettre de runner GitHub sur le VPS.
   - La liste des contrôles est `scripts/verify.sh`. L'image
     `Dockerfile.verify` la lance : construire l'image, c'est faire la
     vérification.
   - Le builder de `lab-infra` vérifie la tête de chaque PR du dépôt vers `v2`
     ou `main`, puis les têtes des branches, et publie le statut de commit
     `usine/verify`. La branche `v2` exige ce statut pour fusionner.
   - Pour `main`, il exige `usine/verify` dès que le commit contient
     `Dockerfile.verify`. Jusqu'à la bascule, `main` est la v1 et ne le contient
     pas : il suffit alors d'un run `verify.yml` réussi, même lancé à la main.
   - `.github/workflows/verify.yml` reste un secours manuel
     (`workflow_dispatch`), qui lance le même `scripts/verify.sh`.

Les changements côté `lab-infra` (rôle `usine-builder`, stack, README)
passeront par des PR de `lab-infra`.

## Outils de `lab-infra`

Pour comprendre ou reprendre la main, l'infrastructure est décrite en IaC dans
`lab-infra` (`proj path lab-infra`, soit `~/memolabs/lab/infrastructure`) :

```sh
make status                      # l'état des stacks
make why app=usine               # pourquoi ce déploiement a fait ça
make rollback app=usine sha=…    # revenir à une révision
make logs app=usine
```

La stack vit dans `/opt/stacks/usine` sur le VPS. `/opt/usine` est un reliquat
de l'époque « image construite depuis un tarball », il ne sert plus à rien.

> `deployment/redeploy.sh` a été **supprimé** : il poussait une archive par scp
> puis appelait `docker exec coolify php artisan tinker`. Son propre en-tête
> disait qu'il deviendrait inutile le jour où le dépôt GitHub existerait. Il
> existe.

## Le relais de raisonnement (`services/relay`)

Il existe pour une seule raison : **une clé OpenRouter ne peut pas vivre dans
un bundle client**. Elle se lit dans l'onglet réseau et se vide. Le relais la
garde côté serveur ; le navigateur ne parle qu'à `/api`, sur la même origine,
ce qui laisse `connect-src 'self'` intact.

Ce qu'il fait, et rien d'autre :

- `GET /health` → `{ ready, model }`. `ready` dit **s'il y a** une clé, jamais
  laquelle. C'est ce que la page lit au chargement pour choisir son mode.
- `POST /reason` → `{ text, model, tokens }`. Rôles admis en liste blanche
  (`agent`, `master-agent`, `planner`, `architect`, `sceptic`), instruction
  bornée à 1200 caractères, contexte à 6000, sortie à 1200 tokens, 40 demandes
  par minute et par adresse — un seul run en fait une dizaine — et 400 par jour
  toutes adresses confondues.
- Le raisonnement du modèle est **désactivé** (`reasoning: { enabled: false }`).
  Mesuré sur DeepSeek V4 Flash : deux appels sur trois rendaient 1200 tokens de
  réflexion et zéro caractère de contenu. Ce qu'on demande est un objet JSON
  dans une forme fixe, pas une délibération.
- Toute panne — quota, 401, fournisseur muet, relais arrêté — retombe côté
  client sur ce que l'agent avait déjà. **Un run va toujours au bout.**

### Il vit dans le même conteneur que le site

Une seule image, deux processus : nginx au premier plan, le relais sur la
boucle locale en `127.0.0.1:3000`. `deployment/entrypoint.sh` démarre les deux.

C'est un choix, et il venait d'une contrainte réelle : le control plane d'alors
(Coolify) ne donnait **pas d'alias DNS stable** à ses conteneurs, leur nom
portant un horodatage qui changeait à chaque déploiement. Deux conteneurs
auraient obligé à exposer le relais sur un domaine public pour que le nginx *de
la même machine* puisse l'atteindre : une sortie sur Internet pour revenir chez
soi. Un conteneur, une boucle locale, et le problème n'existe pas. La contrainte
a disparu avec Coolify ; le choix reste bon, et le défaire ne rapporterait rien.

Ce qu'il faut donc dans l'environnement de la stack **usine**, et nulle part
ailleurs :

- `OPENROUTER_API_KEY` — **jamais dans le dépôt, jamais dans une conversation**
- facultatif : `MODEL` (défaut `deepseek/deepseek-v4-flash`), `ORIGIN` (défaut
  `https://usine.memolabs.dev`), `RELAY_PORT` (défaut `3000`)

`RELAY_PORT` et non `PORT` : une PaaS renseigne `PORT` avec le port public du
conteneur — Coolify y mettait 80 — et le relais se battait avec nginx pour
l'avoir. Coolify est parti, la raison de `RELAY_PORT` non : ne pas le
« simplifier ».
Il n'écoute que sur la boucle : personne hors du conteneur ne l'atteint.

Le relais mort ne fait pas tomber le site : `/api` rend 502, la sonde échoue, et
la page retombe sur sa démonstration rejouée, ce qu'elle annonce à l'écran.

### Coût

DeepSeek V4 Flash : 0,083 $ le million de tokens en entrée, 0,165 $ en sortie.
Un run complet — une dizaine d'appels, quelques milliers de tokens — coûte de
l'ordre de 0,0003 $. Aux plafonds ci-dessus, la journée pleine tient sous
0,05 $.

## Construire et servir

```sh
docker build -t usine-agentique .
docker run --rm -p 8080:80 usine-agentique
```

## Ce qui est contractuel

- **La politique autorise `unsafe-eval`, et rien d'autre.** Les agents écrivent
  le code de leurs outils : sans évaluation, rien d'imprévu ne peut sortir d'un
  run. Aucune source de script externe n'est autorisée pour autant.
- **Aucun secret dans l'image de l'usine.** La clé du relais vit dans
  l'environnement du relais ; celle que l'utilisateur saisit vit en mémoire de
  son onglet et ne survit pas à sa fermeture.
- `connect-src` n'ouvre que `'self'` (le relais) et `api.anthropic.com` (la
  clé du visiteur). En mode déterministe, aucune requête ne part.
- **Le relais ne relaie pas les messages d'erreur du fournisseur** : seul leur
  statut ressort. Un message peut contenir n'importe quoi, la clé comprise.

## Vérifier avant de mettre en ligne

```sh
pnpm exec playwright install chromium   # une fois, sur un dépôt fraîchement cloné
pnpm test:tout                          # les deux projets : noyau et navigateur
pnpm build
```

L'intégration continue (`.github/workflows/verification.yml`) exécute la même
séquence, plus la construction de l'image : les promesses d'interface ne valent
que si quelque chose les vérifie sans qu'on y pense.

## La mesure est éteinte par défaut

Le module de télémétrie n'envoie rien tant qu'aucun transport n'est installé —
et le build livré n'en installe aucun. Pour mesurer, il faut appeler
`installerTelemetrie(transportSansCookie('/mesure'))` au démarrage et servir un
point d'entrée `/mesure` qui compte sans journaliser l'adresse IP ni le
référent. Tant que ce n'est pas fait, M1, M2 et C2 ne sont pas observés : c'est
un choix, pas un oubli.

## Entrée dans le hub

Ajouter au `public/projects.json` de `lab-hub` :

```json
{
  "titre": "L'usine agentique",
  "url": "https://usine.memolabs.dev",
  "resume": "Un système agentique qui se compose lui-même et livre un produit qui marche."
}
```
