# authorization Specification

## Purpose
Décider qui peut faire quoi sur un run. En v1, la règle est minimale : le
propriétaire (l'organisation qui l'a créé) a tous les droits, un run est privé
par défaut, et le partage par lien devient un choix explicite. Les rôles fins
(membre, lecture seule, droit de porte) sont une change suivante.

## Requirements

### Requirement: Runs are private by default
The system SHALL make a stored run visible only to its owning organization unless
that organization explicitly shares it.

#### Scenario: A new run is private
- **WHEN** an authenticated person stores a run
- **THEN** it is not retrievable by an unauthenticated request or another org

### Requirement: Explicit share grants link access
The system SHALL let the owning organization mark a run as shared, after which its
existing share link resolves for anyone holding it; and SHALL let the owner revoke
the share, after which the link stops resolving.

#### Scenario: Sharing enables the link
- **WHEN** the owner marks a run shared
- **THEN** a request with the share link resolves the run, authenticated or not

#### Scenario: Revoking disables the link
- **WHEN** the owner revokes the share
- **THEN** the same link no longer resolves

### Requirement: The owner alone administers a run
The system SHALL restrict destructive or sharing actions on a run (delete, share,
revoke) to its owning organization.

#### Scenario: Non-owner cannot administer
- **WHEN** a person who is not the owner attempts to delete, share, or revoke a run
- **THEN** the action is refused

### Requirement: Anonymous use degrades safely
The system SHALL keep working for a signed-out visitor for the demo run and for
opening a shared link, without silently attributing anonymous runs to any account.

#### Scenario: Signed-out visitor runs the demo
- **WHEN** a signed-out visitor uses the atelier
- **THEN** the run works and is not persisted under any organization
