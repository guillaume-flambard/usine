## Why

**Priorité : P1. Dépend de :** `accounts-and-tenancy`, `run-persistence`,
`security-hardening`.

Dès qu'une équipe importe ses vraies traces d'agents, celles-ci peuvent
contenir des données sensibles (prompts, sorties, identifiants clients). Sans
cadre RGPD, on ne peut pas légalement héberger ces données pour des clients
européens. C'est un bloquant commercial, pas cosmétique.

## What Changes

- **Base légale + registre** : finalité, durée de conservation, minimisation.
- **Droits des personnes** : accès, export, suppression effective d'un run et de
  ses dérivés (branches, mesures).
- **DPA** : accord de sous-traitance type pour les clients.
- **Traitement à l'import** : signaler/retirer les données personnelles
  évidentes d'une trace importée, ou avertir clairement.
- **Localisation des données** : savoir où elles vivent (VPS Coolify) et le dire.

## Capabilities

### New Capabilities
- `data-subject-rights`: accès, export, suppression complète sur demande.
- `retention-policy`: durées de conservation par type de donnée, purge auto.
- `dpa-and-records`: registre des traitements et accord de sous-traitance.

## Impact

- S'appuie sur `run-lifecycle` (suppression/purge) et `audit-log`.
- **Honnêteté** : la suppression efface la donnée **chez nous** ; elle ne défait
  pas un effet externe qu'un agent aurait produit ailleurs (AD-41).
- Sans ça, pas de client entreprise européen.
