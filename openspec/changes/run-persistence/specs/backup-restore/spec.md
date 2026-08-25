## Purpose

Qu'une panne d'hôte ne perde pas le travail : une sauvegarde régulière de la base
et une restauration vérifiée. Le code fournit les procédures ; leur
déclenchement périodique est de l'infra.

## ADDED Requirements

### Requirement: The database can be backed up and restored
The system SHALL provide a documented, runnable procedure to back up the entire
database to a portable dump and to restore it, such that a restore reproduces the
runs and identities that existed at backup time.

#### Scenario: A restore reproduces the data
- **WHEN** a backup is taken, then restored into an empty database
- **THEN** the runs and identities present at backup time are present after
  restore

### Requirement: Backup and restore do not require the application
The system SHALL make backup and restore operable from the database alone
(standard PostgreSQL tooling), so they work even when the service is down.

#### Scenario: Backup works with the service stopped
- **WHEN** an operator takes a backup while the service is not running
- **THEN** the backup succeeds against the database directly
