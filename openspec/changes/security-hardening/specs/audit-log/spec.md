## Purpose

Garder une trace append-only des actions sensibles — qui a partagé, mis à la
corbeille, purgé, restauré un run — attribuée à une org, pour qu'une action
destructrice ou exposante ne soit jamais anonyme une fois la tenancy en place.

## ADDED Requirements

### Requirement: Sensitive actions are recorded
The system SHALL append an audit entry for each sensitive action — at least
share, revoke, trash, restore, purge — capturing the acting organization, the
action, the target run, and the elapsed-safe timestamp. Recording SHALL NOT
block the action from succeeding.

#### Scenario: A destructive action is audited
- **WHEN** an owner trashes or purges a run
- **THEN** an audit entry exists for that org, action, and run

#### Scenario: A sharing action is audited
- **WHEN** an owner shares or revokes a run
- **THEN** an audit entry exists for that org, action, and run

### Requirement: The audit trail is append-only
The system SHALL NOT expose any way to edit or delete audit entries through the
application; entries only accumulate.

#### Scenario: No mutation path
- **WHEN** the application is used
- **THEN** it offers no endpoint to modify or remove an audit entry

### Requirement: An organization reads only its own audit
The system SHALL let an authenticated organization read its own audit entries,
and SHALL NOT reveal another organization's entries.

#### Scenario: Own audit is readable
- **WHEN** an authenticated org requests its audit
- **THEN** it receives its own entries and no other org's

#### Scenario: Audit requires sign-in
- **WHEN** an unauthenticated request asks for the audit
- **THEN** it is refused

### Requirement: The audit carries no secrets
The system SHALL NOT write secrets (provider keys, session tokens, magic-link
tokens) into audit entries.

#### Scenario: Entries are free of secrets
- **WHEN** an audit entry is written
- **THEN** it contains no session token, magic-link token, or provider key
