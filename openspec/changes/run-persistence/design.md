## Context

Voir `proposal.md — Why`. `accounts-and-tenancy` a livré le `RunStore` durable
(port + impls mémoire et Postgres), l'appartenance par org, le listing
(`GET /runs`) et une suppression **définitive et immédiate**. Le flux d'un run
reste le format d'archive (AD-33) ; l'org, le partage et — désormais — l'état de
corbeille vivent à côté du flux.

## Goals / Non-Goals

**Goals :**
- Corbeille réversible (soft-delete) + restauration + purge (rétention).
- Export d'un run par son propriétaire.
- Vue « mes runs » pour un visiteur connecté (sinon la tenancy les cache).
- Sauvegarde/restauration de la base, opérables sans le service.

**Non-Goals (v1) :**
- Recherche plein-texte (listing simple).
- Planificateur intégré : la purge et la sauvegarde périodiques sont de l'infra.
- Toute annulation d'effet de bord externe (AD-41).

## Decisions

- **Corbeille = colonne `trashed_at` (nullable).** `NULL` = vivant. `get`/`list`
  excluent les runs en corbeille ; supprimer = poser `trashed_at` ; restaurer =
  le remettre à `NULL`. *Alt. écartée* : table séparée — dupliquerait le schéma
  et les requêtes pour un simple drapeau daté.
- **Suppression définitive uniquement par purge.** `purge(run_id, owner)` retire
  un run en corbeille ; `purge_expired(older_than)` retire ceux en corbeille
  au-delà de la fenêtre. Aucune autre voie ne détruit un run. Fenêtre par
  `RUN_TRASH_RETENTION_DAYS` (défaut raisonnable). Le déclenchement périodique
  est de l'infra (cron Coolify), pas un thread caché.
- **Horloge injectée** dans les stores (défaut `time.time`) : la purge par
  fenêtre se teste sans attendre. Cohérent avec `TokenStore`/`SessionStore`.
- **Export = l'archive, telle quelle.** `GET /runs/{id}/export`, propriétaire
  seul (pas via lien partagé), `content-disposition: attachment`. Rien de
  calculé : tout est déjà dans le flux.
- **Front « mes runs ».** Un `runs-client.ts` (list, share, revoke, trash,
  restore, purge, export) et un panneau accessible une fois connecté. Ouvrir un
  run = aller sur `?run=<id>` (le chemin de rejeu existant). Sans cette vue, un
  visiteur connecté ne verrait aucun de ses runs (ils sont privés).
- **Sauvegarde par `pg_dump`, restauration par `pg_restore`.** Scripts dans
  `deployment/`, opérables contre la base seule (service arrêté). *Alt. écartée* :
  export applicatif — ne survivrait pas à une base corrompue et exigerait le
  service debout.

## Risks / Trade-offs

- **Purge non planifiée** → la corbeille grossit. *Mitigation* : `purge_expired`
  fourni et testé ; tâche d'infra nommée pour le cron.
- **Attente « supprimé = parti pour de bon ».** *Mitigation* : la corbeille est
  la valeur (récupération), et l'interface nomme la purge explicitement.
- **Restauration testée pour de vrai ?** *Mitigation* : vérifiée à la main contre
  un Postgres jetable (dump → base vide → restore → données présentes) ; non
  rejouée en CI (pas de base).

## Migration Plan

Additif : migration `0002` ajoute `runs.trashed_at TIMESTAMPTZ NULL` +
index partiel sur les runs vivants. Rétrocompatible : les runs existants ont
`trashed_at = NULL` (vivants). Rollback = ignorer la colonne (les routes de
corbeille disparaissent, `delete` redeviendrait définitif — à éviter).

## Open Questions

- Valeur par défaut de la fenêtre de rétention (jours) — n'affecte pas le
  contrat ; réglable par variable d'environnement.
