## Purpose

Un modèle de menace écrit et tenu à jour : sans lui, chaque durcissement est
une intuition. Il nomme la surface d'attaque de l'atelier et ce qui la défend,
pour qu'une revue ou un pentest parte d'une carte, pas d'une page blanche.

## ADDED Requirements

### Requirement: A threat model document exists and is maintained
The project SHALL keep a committed threat-model document covering, at least: the
model-written-code sandbox (Web Worker with capabilities removed, sandboxed
iframe), the reasoning relay / service, trace import as hostile data, run sharing
by link, and passwordless authentication. For each, it names the threat, the
current mitigation, and any residual risk.

#### Scenario: The document covers the named surfaces
- **WHEN** a reviewer opens the threat model
- **THEN** it addresses the sandbox, the service, trace import, sharing, and auth,
  each with a mitigation and residual risk

### Requirement: The honesty guardrails are stated as security posture
The threat model SHALL state the two honesty guardrails as scope limits: rollback
is intra-runtime (it does not undo external side effects), and the product is a
primitive, not a reliability platform or control plane.

#### Scenario: Guardrails are present
- **WHEN** a reviewer reads the threat model
- **THEN** both honesty guardrails appear as explicit scope limits
