# Déploiement — usine.memolabs.dev

Build statique servi par nginx. Aucun service, aucune base, aucun secret côté
serveur : l'application tourne entièrement dans l'onglet du visiteur.

## Construire et servir

```sh
docker build -t usine-agentique .
docker run --rm -p 8080:80 usine-agentique
```

## Ce qui est contractuel

- **La politique de sécurité est stricte, sans `unsafe-eval`.** Le mode par
  défaut doit passer sous cette politique. La fabrication par évaluation de
  code, réservée au mode LLM branché, échouera proprement ici — c'est voulu.
- **Aucune variable d'environnement** dans le chemin par défaut.
- **Aucun secret dans l'image.** La seule clé du système est saisie par
  l'utilisateur, vit en mémoire de l'onglet, et ne survit pas à sa fermeture.
- `connect-src` n'ouvre que `api.anthropic.com`, et seulement pour le mode
  branché. En mode par défaut, aucune requête ne part.

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
