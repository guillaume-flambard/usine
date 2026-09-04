## Purpose

Les documents qu'un client entreprise européen exige avant de confier ses
données : un registre des traitements (ce qu'on collecte, pourquoi, où, combien
de temps) et un accord de sous-traitance type.

## ADDED Requirements

### Requirement: A register of processing exists
The project SHALL keep a committed register of processing describing, at least:
the categories of data (account email, run archives which may contain
model prompts/outputs, audit entries), the purpose, the retention, the storage
location, and the data-subject rights and how to exercise them.

#### Scenario: The register covers the required fields
- **WHEN** a reviewer opens the register
- **THEN** it states categories, purpose, retention, location, and rights

### Requirement: A DPA template is available
The project SHALL provide a data-processing-agreement template a client can use,
naming the sub-processor(s) and the security measures in force.

#### Scenario: A client can obtain a DPA
- **WHEN** a client asks for a DPA
- **THEN** a committed template exists naming sub-processors and measures
