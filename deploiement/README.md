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
pnpm test           # le noyau, le réducteur, les scénarios
pnpm test:navigateur # les promesses d'interface, dans un vrai navigateur
pnpm build
```

## Entrée dans le hub

Ajouter au `public/projects.json` de `lab-hub` :

```json
{
  "titre": "L'usine agentique",
  "url": "https://usine.memolabs.dev",
  "resume": "Un système agentique qui se compose lui-même et livre un produit qui marche."
}
```
