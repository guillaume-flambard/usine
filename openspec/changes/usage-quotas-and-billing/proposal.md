## Why

**Priorité : P2. Dépend de :** `accounts-and-tenancy`, `run-persistence`.

Pas de plans, pas de quotas, pas de mesure d'usage : impossible de monétiser ni
de borner l'abus (un import géant, une ré-exécution qui boucle). Nécessaire pour
en faire un produit payant et pour protéger l'infra.

## What Changes

- **Mesure d'usage** : runs, imports, ré-exécutions, stockage — par org.
- **Quotas et limites** : par plan ; refus propre au-delà (jamais un plantage).
- **Plans et facturation** : intégration d'un prestataire de paiement ; la
  facturation ne touche jamais de données de carte côté client.
- **Tableau d'usage** : ce que l'org a consommé, lisible.

## Capabilities

### New Capabilities
- `usage-metering`: comptage d'usage par org, sans PII.
- `quota-enforcement`: limites par plan, refus gracieux.
- `billing`: plans et paiement via prestataire externe.

## Impact

- S'appuie sur l'identité/org et la mesure existante (`measure`/`evaluation`).
- Les quotas bornent aussi la charge (`scalability-and-ha`) et l'exposition
  (`security-hardening`).
- Rester l'atelier : la facturation est un habillage, pas le produit.
