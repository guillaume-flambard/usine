## Purpose

Donner à une personne les droits que le RGPD exige sur ses données : savoir ce
qu'on détient, l'emporter, et la faire effacer — le tout depuis l'application,
sur ses propres données. La suppression efface la trace **interne**, jamais un
effet de bord externe (AD-41).

## ADDED Requirements

### Requirement: Right of access
The system SHALL let an authenticated person obtain a summary of the data held
about them: their email, their organization, and the counts of their live and
trashed runs.

#### Scenario: A signed-in person sees what is held
- **WHEN** an authenticated person requests their account summary
- **THEN** they receive their email, org, and their run counts
- **AND** an unauthenticated request is refused

### Requirement: Right to portability
The system SHALL let an authenticated person export all their data in one
response: their account identity and the archives of all their runs (live and
trashed), as the internal format of record.

#### Scenario: Export bundles all of one's runs
- **WHEN** an authenticated person exports their data
- **THEN** the bundle contains their account and every run they own
- **AND** it contains no other organization's data

### Requirement: Right to erasure
The system SHALL let an authenticated person erase their account, permanently
removing across all stores: the account and its organization, all its runs (live
and trashed), its sessions, its outstanding magic-link tokens, and its audit
entries. After erasure the session no longer authenticates, and signing in again
with the same email creates a fresh account.

#### Scenario: Erasure removes everything for that person
- **WHEN** an authenticated person erases their account
- **THEN** their runs, sessions, tokens, and audit entries are gone
- **AND** the same session no longer authenticates

#### Scenario: Erasure touches no one else
- **WHEN** one person erases their account
- **THEN** another organization's runs, sessions, and audit are untouched

#### Scenario: Erasure requires sign-in
- **WHEN** an unauthenticated request asks to erase an account
- **THEN** it is refused
