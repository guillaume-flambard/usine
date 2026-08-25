## Why

**Priorité : P2. Dépend de :** `run-persistence`, `product-observability`.

Un seul conteneur, pas de test de charge, pas de haute dispo, pas de plan de
reprise. Tient une démo, pas une charge d'équipes concurrentes ni une panne
d'hôte. À traiter une fois le produit réellement utilisé, pas avant.

## What Changes

- **Tests de charge** : rejeu, fork, import concurrents ; trouver les limites
  réelles avant les clients.
- **Montée en charge** : séparer front / service / stockage ; scaler le service
  horizontalement ; borner les runs coûteux.
- **Haute dispo + reprise (DR)** : redondance, bascule, RTO/RPO définis et
  testés.
- **Files bornées** : l'import et la ré-exécution passent par une file avec
  quotas, jamais en synchrone illimité.

## Capabilities

### New Capabilities
- `load-testing`: scénarios de charge reproductibles et seuils.
- `horizontal-scaling`: service sans état scalable, stockage séparé.
- `disaster-recovery`: redondance, bascule, RTO/RPO testés.

## Impact

- Contrainte projet maintenue : déploiement **uniquement** via Coolify.
- S'appuie sur les SLO de `product-observability` pour savoir quand scaler.
- Interagit avec `usage-quotas-and-billing` (les quotas bornent la charge).
