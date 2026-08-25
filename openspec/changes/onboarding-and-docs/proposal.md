## Why

**Priorité : P2. Dépend de :** `accounts-and-tenancy` (parcours de première
connexion), `import-external-traces` (livré).

Le produit se découvre par la démo, pas par un parcours guidé. Une équipe qui
arrive avec sa trace ne sait pas comment l'importer, forker, lire la comparaison.
Il manque l'onboarding, la doc utilisateur, le support, et un audit
d'accessibilité complet (seul ForkView a été revu).

## What Changes

- **Onboarding in-app** : premier import guidé, exemple de trace fourni, tour de
  la scène (rejeu → fork → deux futurs → porte).
- **Doc utilisateur** : formats de trace supportés, garde-fous d'honnêteté
  expliqués (ce que le rollback fait et ne fait pas).
- **Support** : canal de contact, page d'état honnête (pas de survente).
- **Audit d'accessibilité complet** : clavier, focus, contraste, aria sur
  **toutes** les surfaces, pas seulement ForkView.
- **Robustesse import** : plus de formats, gros fichiers bornés, versions de
  schémas — durcir l'adaptateur v1.

## Capabilities

### New Capabilities
- `onboarding`: parcours de première utilisation, exemple fourni.
- `user-documentation`: doc produit, formats, garde-fous.
- `accessibility-conformance`: audit a11y complet et corrigé.

### Modified Capabilities
- `trace-import`: durcissement (formats additionnels, gros fichiers, versions de
  schémas) — le contrat de refus/rejeu reste, la robustesse augmente.

## Impact

- La doc reste franche : dire ce que l'atelier ne fait pas (effets externes non
  annulés) autant que ce qu'il fait (AD-41).
- Dernière ligne droite avant « prêt pour une équipe cliente ».
