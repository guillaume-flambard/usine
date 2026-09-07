# composer-clarity Specification

## Purpose
Épurer le composeur pour qu'il n'égare plus : supprimer les exemples de jargon
conformité, démarrer sur un champ vide avec une accroche claire, préserver le
rappel d'honnêteté quand aucun modèle n'est branché, et garder le site sans clé
vivant par une unique entrée « voir un run enregistré ».

## Requirements

### Requirement: No prefilled jargon example needs
The composer SHALL NOT present prefilled example-need chips. The need field SHALL
start empty with a single clear accroche.

#### Scenario: Composer starts empty
- **WHEN** the page loads and no need has been typed
- **THEN** the composer shows no example-need chips
- **AND** the need field is empty with a single accroche line

### Requirement: Honest hint when no model is connected
When no model is connected (demo mode) and the typed need is not the replayable
one, the composer SHALL state that the need will produce nothing, rather than
implying it will run.

#### Scenario: Typed need with no model produces nothing
- **WHEN** demo mode is active and the typed need is not replayable
- **THEN** the composer shows the « sans modèle, rien ne sort » hint

### Requirement: A single recorded-run entry keeps the keyless site alive
The composer SHALL offer exactly one entry to play a recorded run, so a visitor on
the keyless public site can see the workshop run without typing a jargon need.
This entry SHALL be labeled as a recorded run, never as a live result.

#### Scenario: Keyless visitor plays the recorded run
- **WHEN** no model is connected
- **AND** the visitor activates the « voir un run enregistré » entry
- **THEN** the recorded run plays through the normal scene
- **AND** the status line says it is a replay
