## Why

**Priorité : P0. Dépend de :** `accounts-and-tenancy` (livré).

`accounts-and-tenancy` a déjà posé la persistance durable : les runs vivent dans
PostgreSQL, appartiennent à une org, sont listables (`GET /runs`) et supprimables.
Il manque deux choses pour qu'une équipe fasse *confiance* à cette persistance :
(1) une **gestion sûre du cycle de vie** — aujourd'hui la suppression est
définitive et immédiate, sans corbeille ni rétention, et rien dans l'interface ne
montre à un visiteur connecté ses propres runs ; (2) une **sauvegarde vérifiée**,
pour qu'une panne d'hôte ne perde pas le travail.

## What Changes

- **Corbeille au lieu d'une suppression sèche** : supprimer un run le met à la
  corbeille (réversible) ; il disparaît des listes et des liens mais peut être
  restauré. La purge définitive est explicite, ou automatique après une fenêtre
  de rétention. **Jamais de suppression définitive silencieuse.**
- **Rétention + purge** : les runs en corbeille au-delà d'une fenêtre
  configurable sont purgés ; la purge est une opération nommée et testée (son
  déclenchement périodique est de l'infra).
- **Export** : un propriétaire peut exporter un run (son flux d'archive, le
  format de record) pour l'emporter hors de l'atelier.
- **Vue « mes runs »** : un visiteur connecté voit, ouvre, partage/révoque,
  met à la corbeille et restaure ses runs — sinon la tenancy les rend invisibles.
- **Sauvegarde/restauration** : script `pg_dump`/`pg_restore` documenté et
  vérifié ; le déclenchement régulier est de l'infra.

## Capabilities

### New Capabilities
- `run-lifecycle`: corbeille réversible, rétention, purge explicite, et export
  d'un run par son propriétaire.
- `backup-restore`: sauvegarde régulière de la base et restauration vérifiée.

### Modified Capabilities
- `tenancy`: la suppression d'un run devient une mise à la corbeille
  (réversible) ; la lecture et le listing excluent les runs en corbeille.

## Impact

- **Code** : le `RunStore` (port + impls mémoire et Postgres) gagne corbeille,
  restauration, purge, et un listing qui exclut la corbeille ; une migration SQL
  ajoute `trashed_at`. Nouveau front : une vue « mes runs ».
- **Honnêteté (AD-41)** : purger un run efface la trace **interne**, pas un effet
  de bord externe qu'un agent aurait produit. La corbeille protège de la perte
  accidentelle ; elle ne prétend pas annuler le monde.
- **Infra (utilisateur)** : planifier la purge et la sauvegarde (timer systemd sur le VPS).
- Reste hors périmètre : recherche plein-texte (listing simple pour l'instant).
