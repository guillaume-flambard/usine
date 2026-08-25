## Why

**Priorité : P0. Dépend de :** `accounts-and-tenancy`.

Les runs sont conservés par un service de stockage minimal, sans base durable,
sans rétention, sans sauvegarde. Une équipe ne peut pas retrouver ses
trajectoires de façon fiable, ni faire confiance à leur pérennité. Il faut une
persistance durable, propriétaire d'org, sauvegardée.

## What Changes

- **Base de données durable** : les archives (flux `RunEvent`, le format
  d'archive AD-33) stockées par org, indexées, listables.
- **Cycle de vie** : rétention configurable, suppression sur demande, corbeille
  puis purge (jamais de suppression définitive silencieuse).
- **Sauvegarde/restauration** : dumps réguliers, restauration testée.
- **Migration** : reprendre les runs déjà stockés par le service actuel sans
  perte.

## Capabilities

### New Capabilities
- `run-store`: persistance durable des archives par org, listing, recherche.
- `run-lifecycle`: rétention, corbeille, purge, export.
- `backup-restore`: sauvegardes régulières et restauration vérifiée.

## Impact

- Le format stocké reste le flux d'événements — ne pas y ajouter de dépendance à
  un objet vivant (AD-33).
- **Honnêteté** : la suppression d'un run efface la trace **interne** ; elle ne
  défait aucun effet de bord qu'un agent réel aurait produit ailleurs.
- Dépend de l'identité/org (`accounts-and-tenancy`) ; prérequis de la conformité
  RGPD (`data-privacy-compliance`).
