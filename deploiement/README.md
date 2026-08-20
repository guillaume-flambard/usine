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

Pour redéployer après un changement : `./deploiement/redeployer.sh`

**À convertir dès que le dépôt existe** : créer `guillaume-flambard/usine`,
pousser, puis dans Coolify passer l'application en build pack `dockerfile`
avec cette source. Le `git push` déclenchera alors le déploiement, comme pour
les quatorze autres applications, et le registre local comme ce script
deviendront inutiles.

## Le relais de raisonnement (`services/relais`)

Il existe pour une seule raison : **une clé OpenRouter ne peut pas vivre dans
un bundle client**. Elle se lit dans l'onglet réseau et se vide. Le relais la
garde côté serveur ; le navigateur ne parle qu'à `/api`, sur la même origine,
ce qui laisse `connect-src 'self'` intact.

Ce qu'il fait, et rien d'autre :

- `GET /sante` → `{ pret, modele }`. `pret` dit **s'il y a** une clé, jamais
  laquelle. C'est ce que la page lit au chargement pour choisir son mode.
- `POST /raisonner` → `{ texte, modele, tokens }`. Trois rôles admis
  (`planificateur`, `architecte`, `sceptique`), instruction bornée à 500
  caractères, contexte à 4000, sortie à 400 tokens, 6 demandes par minute et
  par adresse, 300 par jour toutes adresses confondues.
- Toute panne — quota, 401, fournisseur muet, relais absent — retombe sur le
  repli écrit à la main, côté client. **Un run va toujours au bout.**

### Le déployer

Seconde application Coolify, dans le même projet et **sur le même réseau
Docker** que l'usine :

- source : le dossier `services/relais` (build pack `dockerfile`)
- nom du service : `relais` — c'est le nom que `RELAIS_URL` vise par défaut
- variable d'environnement `OPENROUTER_API_KEY` — **collée dans Coolify, jamais
  dans le dépôt, jamais dans une conversation**
- variables facultatives : `MODELE` (défaut `anthropic/claude-3.5-haiku`),
  `ORIGINE` (défaut `https://usine.memolabs.dev`)
- pas de domaine public : il n'est joint que par nginx, par le réseau interne

Côté usine, `RELAIS_URL` est substituée au démarrage du conteneur
(`NGINX_ENVSUBST_FILTER=^RELAIS_`). Un autre nom de service se règle sans
reconstruire l'image.

Sans relais déployé, `/api` rend 502, la sonde échoue, et le site reste en mode
déterministe — ce qu'il annonce à l'écran. Aucune page cassée.

## Construire et servir

```sh
docker build -t usine-agentique .
docker run --rm -p 8080:80 usine-agentique
```

## Ce qui est contractuel

- **La politique de sécurité est stricte, sans `unsafe-eval`.** Le mode par
  défaut doit passer sous cette politique. La fabrication par évaluation de
  code, réservée au mode LLM branché, échouera proprement ici — c'est voulu.
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
