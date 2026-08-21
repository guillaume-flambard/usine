# Déploiement — usine.memolabs.dev

Build statique servi par nginx. Aucune base. Un seul service optionnel — le
relais de raisonnement — qui existe pour garder une clé hors du navigateur.
Sans lui, l'application tourne entièrement dans l'onglet du visiteur, en mode
déterministe.

## Comment l'usine est déployée aujourd'hui

En ligne sur **https://usine.memolabs.dev**, servie par Coolify (projet Memo
Labs) derrière Traefik, certificat Let's Encrypt.

L'application y est déclarée en type **image Docker** et non en build pack
`dockerfile`, parce que le dépôt `guillaume-flambard/usine` n'existe pas
encore sur GitHub. L'image est donc construite **sur le serveur**, depuis
`/opt/usine`, et poussée dans un registre local (`127.0.0.1:5000`) que Coolify
tire ensuite.

Pour redéployer après un changement : `./deployment/redeploy.sh`

**À convertir dès que le dépôt existe** : créer `guillaume-flambard/usine`,
pousser, puis dans Coolify passer l'application en build pack `dockerfile`
avec cette source. Le `git push` déclenchera alors le déploiement, comme pour
les quatorze autres applications, et le registre local comme ce script
deviendront inutiles.

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

C'est un choix, et il vient d'une contrainte réelle : **Coolify ne donne pas
d'alias DNS stable à ses conteneurs** — leur nom porte un horodatage qui change
à chaque déploiement. Deux conteneurs auraient obligé à exposer le relais sur un
domaine public pour que le nginx *de la même machine* puisse l'atteindre : une
sortie sur Internet pour revenir chez soi. Un conteneur, une boucle locale, et
le problème n'existe pas.

Ce qu'il faut donc côté Coolify, sur l'application **usine** et nulle part
ailleurs :

- `OPENROUTER_API_KEY` — **collée dans Coolify, jamais dans le dépôt, jamais
  dans une conversation**
- facultatif : `MODEL` (défaut `deepseek/deepseek-v4-flash`), `ORIGIN` (défaut
  `https://usine.memolabs.dev`), `RELAY_PORT` (défaut `3000`)

`RELAY_PORT` et non `PORT` : une PaaS renseigne `PORT` avec le port public du
conteneur — Coolify y met 80 — et le relais se battait avec nginx pour l'avoir.
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
