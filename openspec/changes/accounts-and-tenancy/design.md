## Context

Voir `proposal.md — Why`. Décisions prises avec l'utilisateur : **lien magique
maison** (pas de mot de passe, pas de tiers), **PostgreSQL** (sert aussi
`run-persistence`), **tranche minimale d'abord** (une org par utilisateur, runs
privés, propriétaire seul ; RBAC fin reporté).

État actuel : `services/api` (FastAPI) est assemblé par `create_app(...)` avec
tout l'extérieur injectable, et `RunStore` est déjà un `Protocol` avec une impl
en mémoire (les routes ne changent pas quand on branche Postgres). Le front
(Vue 3) pousse/relit un run anonymement via `src/app/archive-client.ts`. Le flux
d'événements reste le format d'archive (AD-33) : aucun champ d'identité n'y entre.

## Goals / Non-Goals

**Goals :**
- Connexion par lien magique, sessions HTTP-only, déconnexion.
- Une org personnelle par compte ; runs rattachés à l'org.
- Runs privés par défaut ; partage par lien explicite et révocable.
- Postgres derrière des ports, impl en mémoire pour les tests (pas de base
  requise en CI).

**Non-Goals (v1) :**
- Multi-membres, invitations, RBAC fin, droit de porte assignable → change
  `authorization` suivante.
- SSO/OAuth, mot de passe, MFA.
- Migration des runs anonymes déjà stockés (le store actuel est en mémoire,
  éphémère).

## Decisions

- **Lien magique, jeton opaque à usage unique.** On stocke un *hash* du jeton
  (jamais le jeton en clair), avec expiration et drapeau « utilisé ». *Alt.
  écartée* : mot de passe (surface : reset, fuite de hash, MFA) ; OAuth (tiers +
  données d'identité ailleurs, tension RGPD).
- **Session par cookie signé HTTP-only, `Secure`, `SameSite=Lax`.** Le client ne
  lit jamais le secret (règle projet « la clé ne touche jamais le client »
  étendue à la session). *Alt. écartée* : JWT en `localStorage` (lisible par
  script, vol par XSS).
- **Pas d'énumération de comptes.** La demande de lien répond pareil que l'email
  existe ou non ; la redemption échoue sans dire pourquoi (expiré/utilisé/inconnu).
- **Ports + injection, comme le reste du service.** Nouveaux `Protocol` :
  `IdentityStore` (comptes, orgs), `TokenStore` (liens magiques), `SessionStore`,
  `EmailSender`. Impl en mémoire pour les tests ; impl Postgres pour la prod ;
  `EmailSender` SMTP en prod, faux en test. `create_app(...)` les injecte, défaut
  en mémoire — un test n'a besoin ni de base ni d'SMTP.
- **`RunStore` gagne l'appartenance sans muter l'archive.** L'org propriétaire et
  le drapeau « partagé » vivent à côté du flux (métadonnées de stockage), pas
  dedans (AD-33). Le port `RunStore` passe à des méthodes portant l'org
  (`put(run_id, archive, owner)`, `get(run_id, viewer)`, `list(owner)`,
  `share/revoke/delete(run_id, owner)`).
- **Identité résolue par une dépendance FastAPI.** Une `require_identity` lit le
  cookie de session et rend l'identité, ou 401 ; les routes de run l'exigent sauf
  le chemin « lien partagé » et la démo.
- **Front : un état d'auth léger.** Un module `src/app/auth-client.ts` (demander
  un lien, statut de session, déconnexion) + un composant de connexion discret
  dans la ligne d'état de marque. Le composeur n'exige la connexion que pour
  *conserver/partager* un run, pas pour lancer la démo (dégradation sûre).

## Risks / Trade-offs

- **Pas d'SMTP en prod encore** (infra utilisateur). *Mitigation* : `EmailSender`
  derrière un port ; en dev, un émetteur qui journalise le lien ; la mise en
  service SMTP est une tâche d'infra séparée, nommée, non bloquante pour le code
  et les tests.
- **Postgres à provisionner sur Coolify** (infra utilisateur). *Mitigation* :
  ports + impl en mémoire ; l'adaptateur Postgres est écrit et activé par
  variables d'environnement ; CI reste verte sans base.
- **Cookie de session inter-domaines.** Front et service partagent l'origine via
  le proxy Vite/Traefik (déjà le cas) ; `SameSite=Lax` suffit tant qu'on reste
  same-site. *Risque* si un jour le service passe sur un autre domaine → à
  retraiter alors.
- **Fuite d'existence.** Traiter un run d'une autre org comme 404 (pas 403), et
  ne pas énumérer les comptes.

## Migration Plan

Additif. Nouvelles tables (comptes, orgs, jetons, sessions, appartenance de run)
via des migrations SQL versionnées. Les runs anonymes actuels étant en mémoire,
rien à migrer. Rollback = revenir à l'impl en mémoire (variables d'env) ; les
routes ne changent pas de contrat pour un appel anonyme sur un lien partagé.

## Open Questions

- Fournisseur SMTP retenu (infra) — n'affecte pas le contrat ni le découpage ;
  résolu à la mise en service.
