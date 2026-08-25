## Why

**Priorité : P1. Dépend de :** `accounts-and-tenancy` (pour attribuer les
signaux), `run-persistence`.

Observabilité **du produit lui-même** (le service, le front, le relais) — à ne
pas confondre avec l'observabilité *des agents* du visiteur, qui reste hors
sujet. Aujourd'hui : pas de métriques service, pas d'alerting, pas de SLO, pas
de runbook. On ne sait pas si l'atelier est en bonne santé.

## What Changes

- **Logs structurés + métriques** du service et du front (latence, erreurs,
  saturation), sans données personnelles.
- **SLO + alerting** : objectifs de disponibilité/latence, alertes actionnables.
- **Runbooks** : quoi faire quand le relais tombe, quand un run boucle, quand la
  file d'import sature.
- **Tableau de santé** interne (pas une page publique de « fiabilité »).

## Capabilities

### New Capabilities
- `service-telemetry`: logs/metrics/traces du produit, sans PII.
- `slo-alerting`: objectifs de service et alertes.
- `operational-runbooks`: procédures d'incident.

## Impact

- Réutilise le tracing OTLP déjà bâti côté agents, mais pour **le service**.
- **Garde-fou** : rester l'atelier, ne pas glisser vers un « control plane »
  d'observabilité (cimetière surcapitalisé — décision projet).
- Prérequis d'exploitation sereine avant montée en charge.
