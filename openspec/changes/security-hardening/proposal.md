## Why

**Priorité : P0 (prérequis avant tout utilisateur réel).** Dépend de :
`accounts-and-tenancy` pour l'audit par identité.

Le produit exécute du code écrit par un modèle (Web Worker à capacités
retirées, iframe sablée) — bon socle, mais aucun threat model écrit, aucune
gestion de secrets mûre, aucun audit externe. Avant d'ouvrir à des équipes qui
apportent leurs vraies traces, il faut durcir et prouver.

## What Changes

- **Threat model écrit** : surface d'attaque du bac à sable, du relais, de
  l'import de traces (donnée hostile), du partage par lien.
- **Gestion des secrets** : la clé fournisseur vit dans l'environnement du
  service (déjà) ; formaliser rotation, cloisonnement, absence en clair côté
  client (règle projet).
- **Journal d'audit** : qui a décidé à la porte, qui a forké, qui a supprimé —
  traçable par identité.
- **En-têtes, CSP, isolation** : revue systématique (les pièges déjà connus ont
  leurs tests ; étendre).
- **Préparation pentest** : périmètre, correctifs, re-test.

## Capabilities

### New Capabilities
- `threat-model`: modèle de menace documenté et tenu à jour.
- `audit-log`: journal des actions sensibles par identité et org.
- `secrets-management`: cycle de vie des secrets, jamais côté client.

## Impact

- Transverse : bac à sable, relais/`services/api`, import, partage.
- Ne pas se positionner en « plateforme de fiabilité » : on durcit **une
  primitive**, on ne vend pas de la sécurité d'agents (garde-fou projet).
- Prérequis de `foreign-agent-reexecution` (exécution de code externe) et de
  `data-privacy-compliance`.
