# trace-import Specification

## Purpose
Ingérer la trajectoire d'un agent étranger (export LangGraph, spans OTLP) et la
traduire vers le format d'archive interne, pour qu'une vraie exécution qui a
planté puisse être rejouée, inspectée et mesurée dans l'atelier — sans jamais
laisser croire qu'on peut forker ou hot-swap un agent qu'on ne sait pas
ré-exécuter.

## Requirements

### Requirement: Import produces a replayable internal archive
The system SHALL translate a recognized foreign trace into a valid internal
`RunArchive` (version 1) whose event stream the existing replay engine can
consume with no engine change. Every screen-relevant fact the replay needs
SHALL be carried in the produced stream (invariant AD-33: the stream is the
archive).

#### Scenario: LangGraph trace becomes a replayable run
- **WHEN** a well-formed LangGraph trace export is imported
- **THEN** the system produces a `RunArchive` at version 1
- **AND** replaying that archive reconstructs the same read model on every
  replay, with no kernel and no model present

#### Scenario: OTLP spans become a replayable run
- **WHEN** a well-formed set of OTLP spans describing an agent run is imported
- **THEN** the system produces a `RunArchive` at version 1 replayable by the
  existing engine

### Requirement: Absolute timestamps are normalized to elapsed time
The system SHALL convert the source's absolute timestamps into `at` values
elapsed from the run's first event, and SHALL NOT emit any absolute date into
the produced stream (invariant AD-33).

#### Scenario: First event anchors elapsed time
- **WHEN** a trace whose first step is stamped at some absolute time is imported
- **THEN** the produced stream's first event has `at` equal to 0
- **AND** every later event's `at` equals its offset from that first stamp,
  never a negative value

#### Scenario: Out-of-order source steps are ordered
- **WHEN** the source trace lists steps out of chronological order
- **THEN** the produced stream is ordered by increasing `sequence`, so the
  reducer never sees a stream that goes backward

### Requirement: Imported traces are marked foreign and are not forkable
An imported trace carries no behaviour source, so it cannot be recompiled and
therefore cannot be forked or hot-swapped in this version (invariant AD-49). The
system SHALL mark the produced archive as foreign, and any surface that offers
forking or hot-swap SHALL be hidden for a foreign archive, so the product never
implies a capability it does not have (honesty guardrail AD-41).

#### Scenario: A foreign run can be replayed and measured but not forked
- **WHEN** a foreign archive is loaded
- **THEN** the run replays and its `RunMeasure` metrics are computed
- **AND** the "Forker ce run" affordance is absent

#### Scenario: An internal recorded run stays forkable
- **WHEN** a run recorded by the atelier itself is loaded
- **THEN** it is not marked foreign
- **AND** the fork affordance is available, unchanged from today

### Requirement: Unrecognized or malformed traces are refused, not guessed
The system SHALL refuse a trace it does not recognize or cannot map, rather than
producing a partial or invented archive — the same stance `readArchive` already
takes toward a hostile stored run.

#### Scenario: Unknown format is refused
- **WHEN** a file matching no supported source format is imported
- **THEN** the import fails with a clear reason and produces no archive

#### Scenario: A recognized-but-broken trace is refused
- **WHEN** a trace of a supported format is missing the fields required to
  build an ordered stream
- **THEN** the import fails with a clear reason and produces no archive
