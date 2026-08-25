## Purpose

Faire appartenir chaque run à une organisation, pour isoler les données d'une
équipe des autres. En v1, chaque utilisateur a une organisation personnelle ; le
multi-membres viendra ensuite.

## ADDED Requirements

### Requirement: Every account has a personal organization
The system SHALL create exactly one personal organization for an account on first
sign-in, and SHALL attribute that account's runs to it.

#### Scenario: First sign-in provisions an org
- **WHEN** an email signs in for the first time
- **THEN** an account and its personal organization are created
- **AND** a later sign-in from the same email reuses the same account and org

### Requirement: A stored run belongs to an organization
The system SHALL record the owning organization on every run stored by an
authenticated request, and SHALL keep the run's archive itself unchanged (the
event stream stays the format of record — no owner field leaks into the stream).

#### Scenario: Storing a run records its org
- **WHEN** an authenticated person stores a run
- **THEN** the run is recorded as owned by that person's organization
- **AND** the stored archive's events are byte-for-byte what was submitted

### Requirement: Cross-organization access is refused
The system SHALL prevent one organization from reading, listing, or deleting the
runs of another.

#### Scenario: Reading another org's run
- **WHEN** an authenticated person requests a run owned by a different org
- **THEN** the service refuses as if the run did not exist (no existence leak)

#### Scenario: Listing shows only one's own
- **WHEN** an authenticated person lists runs
- **THEN** only runs owned by their organization are returned
