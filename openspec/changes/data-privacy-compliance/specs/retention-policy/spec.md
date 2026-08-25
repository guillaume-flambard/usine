## Purpose

Ne pas garder les données plus longtemps qu'il ne faut : des durées de
conservation par type de donnée, et une purge qui les applique. La minimisation
est une exigence RGPD, pas une option.

## ADDED Requirements

### Requirement: Expired credentials are purgeable
The system SHALL provide a purge that permanently removes expired magic-link
tokens and expired sessions, so spent credentials do not accumulate.

#### Scenario: Expired tokens and sessions are removed
- **WHEN** the credential purge runs
- **THEN** magic-link tokens and sessions past their expiry are removed
- **AND** unexpired ones are kept

### Requirement: A retention policy is documented
The system SHALL keep a committed document naming, per data type (runs, trashed
runs, tokens, sessions, audit entries), how long it is retained and by which
mechanism it is purged.

#### Scenario: The policy names each data type
- **WHEN** a reviewer opens the retention policy
- **THEN** each stored data type has a stated retention window and purge mechanism

### Requirement: Purges are operable without the service
The system SHALL make the retention purges runnable from a command against the
database, so retention holds even if the application is down; scheduling is
infra.

#### Scenario: A purge runs headless
- **WHEN** an operator runs the retention purge as a command
- **THEN** it removes what is past retention and reports the counts
