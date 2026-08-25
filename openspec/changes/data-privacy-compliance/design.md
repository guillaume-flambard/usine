## Context

Voir `proposal.md — Why`. Les mécanismes existent déjà en grande partie :
corbeille/purge (`run-lifecycle`), export d'un run, journal d'audit, tenancy par
org. Cette change les compose en **droits des personnes** (accès, portabilité,
effacement), ajoute une **purge de rétention** des identifiants expirés, et pose
les **documents** (registre, DPA).

## Goals / Non-Goals

**Goals :**
- Accès (résumé), portabilité (export de toutes ses données), effacement
  (cascade cross-stores) — depuis l'app, sur ses propres données.
- Purge des jetons et sessions expirés ; politique de rétention documentée.
- Registre des traitements + modèle de DPA.

**Non-Goals (v1) :**
- Détection/rédaction automatique de PII dans une trace importée (avertissement
  documenté, pas de code) — trop imprécis pour v1.
- Planificateur intégré des purges (infra).
- Conservation légale/hold (pas de cas d'usage ici).

## Decisions

- **Effacement coordonné au niveau route, un `forget` par port.** Chaque store
  gagne un `forget` ciblé (`RunStore.forget_owner(org)`, `TokenStore.forget(email)`,
  `SessionStore.forget(account)`, `AuditLog.forget(org)`, `IdentityStore.forget(
  account)` qui retire org puis compte). La route les enchaîne dans l'ordre des
  contraintes de clé étrangère (sessions et org avant compte). *Alt. écartée* :
  une transaction unique dans un store géant — casserait l'abstraction des ports
  et la parité mémoire/Postgres.
- **L'audit est append-only en usage courant, mais l'effacement le retire.**
  C'est l'exception RGPD explicite : `AuditLog.forget(org)` n'existe que pour
  l'effacement, aucune route ne modifie une entrée autrement.
- **Rétention par purge, pas par TTL en base.** `purge_expired` sur jetons et
  sessions (comme sur la corbeille) ; une commande headless
  (`python -m usine_api.maintenance`) les enchaîne contre `DATABASE_URL`. *Alt.
  écartée* : `DELETE` planifié en base — invisible au code et intestable.
- **Export = un paquet de flux d'archive.** Rien de calculé : compte + toutes les
  archives (vivantes et en corbeille), le format de record.
- **Front minimal.** Dans « mes runs », une section « mes données » : exporter
  (lien vers `/api/account/export`) et supprimer mon compte (**confirmation**
  explicite, puis déconnexion). L'effacement est irréversible et le dit.
- **Documents** : `docs/9-PRIVACY.md` (registre, rétention, localisation, droits)
  et `deployment/DPA-TEMPLATE.md`.

## Risks / Trade-offs

- **Effacement non atomique cross-stores** (Postgres : connexions séparées). *Mit.*
  ordre respectant les FK ; ré-exécutable (un effacement partiel se complète en le
  relançant) ; en mémoire c'est atomique de fait.
- **Suppression irréversible depuis l'UI.** *Mit.* confirmation explicite ; on
  nomme ce que ça efface (interne) et ce que ça n'efface pas (effets externes,
  AD-41).
- **PII dans les traces importées.** *Mit.* documentée comme responsabilité de
  l'importateur en v1 ; rédaction auto en Deferred.

## Migration Plan

Additif : pas de nouvelle table (les `forget`/`purge_expired` opèrent sur
l'existant). Nouveaux docs. Rollback = retirer les routes de compte et la
commande de maintenance.

## Open Questions

- Sous-processeurs exacts à nommer dans le DPA (hébergeur VPS, fournisseur SMTP,
  fournisseur de raisonnement) — à confirmer par l'utilisateur ; placeholders en
  attendant.
