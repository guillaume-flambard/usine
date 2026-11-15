# ADR 0002 : l'atelier s'authentifie par Pocket ID, fermé par défaut

- **Statut** : accepté
- **Date** : 16 novembre 2026
- **Décideur** : Guillaume Flambard
- **Suivi** : Linear MEM-60, jalon M7 Production

## Contexte

Le ticket MEM-60 partait d'un constat de la v1 : « l'atelier est derrière une basic auth posée sur un routeur Traefik dédié ». Ce constat n'est plus vrai. Le 16 novembre 2026, `lab-infra/stacks/usine/compose.yml` ne pose aucun middleware d'authentification sur `usine.memolabs.dev`.

Trois mécanismes étaient possibles :

| Option | Pour | Contre |
|---|---|---|
| Basic auth Traefik | la plus simple, rien dans le code | l'API ne connaît pas l'utilisateur : pas de `user_id` dans Langfuse, pas d'organisation pour les runs, et un mot de passe partagé |
| Lien magique de l'API (déjà écrit) | testé, sans nouvelle dépendance | tout e-mail obtient un compte, donc l'accès à l'atelier et au modèle ; il faudrait une liste blanche et un SMTP en production |
| **Pocket ID** (`auth.memolabs.dev`) | fournisseur du lab déjà en service (stage `public`, inscriptions fermées), une seule identité pour le lab, `sub` stable pour Langfuse | un client OIDC dans l'API, et un client à enregistrer dans Pocket ID |

Le premier utilisateur de l'usine est le lab (`CLAUDE.md`, décision du 10 septembre 2026). Pocket ID est déjà son fournisseur d'identité.

## Décision

1. L'atelier passe par **Pocket ID**, en OIDC avec le code d'autorisation et PKCE S256, sur un jeton d'identité RS256. La découverte relevée le 16 novembre 2026 annonce exactement ces paramètres.
2. **Fermé par défaut.** Toute route sans identité répond 401, sauf la courte liste publique de `services/api/usine_api/atelier.py` : la sonde, la session, la connexion, et les routes internes du serveur MCP, protégées par leur clé. Seul `USINE_ATELIER_OUVERT=1` ouvre l'atelier, pour le poste de dev et les tests.
3. **Le lien magique est coupé** tant que l'atelier est fermé, puisqu'il donnerait un compte à n'importe quel e-mail.
4. **Liste blanche des `sub`** (`USINE_OIDC_ALLOWED_SUBS`). Vide, elle ne laisse entrer personne.
5. La session de l'API reste celle qui existe déjà. Pocket ID prouve l'identité, puis l'API ouvre son propre cookie de session, rattaché au compte de l'e-mail vérifié. L'identifiant de ce compte part dans Langfuse comme `user_id`.
6. Le serveur MCP n'a pas de session, mais il a un jeton MCP. L'API le lit maintenant (`Authorization: Bearer`). Il n'ouvre que les routes de ses outils, dans sa portée et son organisation. Avant ce lot, l'API ignorait ce jeton, et le serveur MCP lisait l'espace des visiteurs anonymes.
7. La vitrine publique ne parle pas à l'API : sans session, aucune route qui appelle un modèle ne répond.

## Conséquences

- Une étape revient au propriétaire : enregistrer le client `usine` dans Pocket ID avec l'adresse de retour `https://usine.memolabs.dev/api/auth/oidc/callback`, puis poser son identifiant, son secret et le `sub` admis dans le `.env` du service.
- Le front v2 n'a pas encore d'écran de connexion. Avant la recette en ligne (MEM-62), il lui faut un lien « Se connecter » vers `/api/auth/oidc/login`, affiché quand l'API répond 401.
- Les états de connexion en cours vivent en mémoire, pour dix minutes. Avec une seule instance du service, c'est suffisant. Plusieurs instances devraient les partager.
- Le basic auth Traefik reste une défense en profondeur possible devant l'atelier, sans remplacer celle-ci.

## Sources

- Découverte Pocket ID, lue le 16 novembre 2026 : https://auth.memolabs.dev/.well-known/openid-configuration (`response_types_supported: ["code"]`, `code_challenge_methods_supported: ["plain", "S256"]`, `id_token_signing_alg_values_supported: ["RS256"]`, `authorization_response_iss_parameter_supported: true`).
- Stages de Pocket ID dans le lab : `lab-infra/docs/memo-bridge-public.md`, `memo_bridge_auth_stage: public` dans `ansible/group_vars/lab.yml`.
- PKCE : RFC 7636. Paramètre `iss` dans la réponse d'autorisation : RFC 9207.
