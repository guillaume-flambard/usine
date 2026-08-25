## Purpose

Rendre la persistance des runs digne de confiance : une corbeille réversible au
lieu d'une suppression sèche, une purge explicite après rétention, et l'export
d'un run par son propriétaire — sans jamais prétendre défaire un effet de bord
externe (AD-41).

## ADDED Requirements

### Requirement: Deleting a run moves it to the trash
The system SHALL trash a run when its owner deletes it: the run stops appearing
in listings and stops resolving by link, but is retained and can be restored.
The system SHALL NOT permanently remove a run as a side effect of a single
delete action.

#### Scenario: A trashed run disappears from view but survives
- **WHEN** the owner deletes a run
- **THEN** the run no longer appears in the owner's listing
- **AND** a request for it (owner or shared link) resolves as not found
- **AND** the run still exists in the trash

#### Scenario: A trashed run's share link stops resolving
- **WHEN** a shared run is trashed
- **THEN** its share link no longer resolves, even while the run is retained

### Requirement: The owner can restore a trashed run
The system SHALL let the owning organization restore a trashed run, returning it
to normal visibility with its prior share state.

#### Scenario: Restore brings a run back
- **WHEN** the owner restores a trashed run
- **THEN** it appears again in the owner's listing and resolves for the owner

#### Scenario: Only the owner restores
- **WHEN** a non-owner attempts to restore a run
- **THEN** the action is refused

### Requirement: Trashed runs are purged after a retention window
The system SHALL provide an explicit purge that permanently removes trashed runs
older than a configurable retention window, and SHALL permanently remove a run
only through purge — never as an unannounced side effect. Purging erases the
internal trace only; it makes no claim about external side effects (AD-41).

#### Scenario: Purge removes only long-trashed runs
- **WHEN** purge runs with a retention window
- **THEN** runs trashed longer ago than the window are permanently removed
- **AND** runs trashed within the window, and live runs, are kept

#### Scenario: Owner can purge one run immediately
- **WHEN** the owner purges a specific trashed run
- **THEN** it is permanently removed
- **AND** a non-owner cannot purge it

### Requirement: The owner can export a run
The system SHALL let the owning organization export a run as its archive (the
event stream, the format of record), suitable for taking out of the atelier.

#### Scenario: Export yields the archive
- **WHEN** the owner exports one of their runs
- **THEN** the response carries the run's archive (version, brief, events)
- **AND** a non-owner cannot export it
