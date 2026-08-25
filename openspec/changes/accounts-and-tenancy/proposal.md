## Why

**Priorité : P0 (produit multi-utilisateur). Dépend de :** rien (fondation).

Le produit n'a aucune notion d'utilisateur ni d'organisation : tout run est
public/anonyme. Impossible de vendre, d'isoler les données d'une équipe, ou de
donner des droits. C'est la fondation de tout le reste (persistance, quotas,
conformité).

## What Changes

- **Comptes et sessions** : inscription/connexion (déléguée à un fournisseur
  d'identité ; la clé/mot de passe ne touche jamais notre client).
- **Organisations (tenants)** : un run appartient à une org ; isolation stricte
  entre orgs.
- **Rôles (RBAC)** : au minimum propriétaire / membre / lecture seule ; la porte
  humaine (valide/rejette une branche) devient un droit assignable.
- **Runs privés par défaut** : le partage par lien devient un choix explicite,
  pas l'état de base.

## Capabilities

### New Capabilities
- `accounts`: identité, sessions, connexion via fournisseur externe.
- `tenancy`: organisations, appartenance d'un run à une org, isolation.
- `authorization`: rôles et droits, dont le droit de décider à la porte humaine.

## Impact

- Touche tout : chaque run, chaque archive, chaque endpoint du service porte
  désormais une identité et une org.
- **Vie privée** : aucune donnée personnelle en clair dans les URL ; le lien de
  partage ne fuit pas l'appartenance.
- Dépendance amont de `run-persistence`, `usage-quotas-and-billing`,
  `data-privacy-compliance`.
- Ne pas dériver en « control plane » : rester l'atelier, pas une plateforme
  d'administration d'agents (garde-fou projet).
