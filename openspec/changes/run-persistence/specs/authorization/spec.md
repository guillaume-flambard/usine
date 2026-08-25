## MODIFIED Requirements

### Requirement: The owner alone administers a run
The system SHALL restrict destructive or sharing actions on a run (trash,
restore, purge, share, revoke) to its owning organization. Deleting a run
trashes it (reversible); it is not removed permanently by that action.

#### Scenario: Non-owner cannot administer
- **WHEN** a person who is not the owner attempts to trash, restore, purge,
  share, or revoke a run
- **THEN** the action is refused

#### Scenario: Deleting trashes rather than destroys
- **WHEN** the owner deletes a run
- **THEN** the run is moved to the trash and can be restored
- **AND** it is not permanently removed by that single action
