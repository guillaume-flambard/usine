## Purpose

Formaliser ce qui était déjà tenu de fait : la clé du fournisseur et les secrets
de session vivent dans l'environnement du service, jamais côté client — et le
rendre vérifiable plutôt que coutumier.

## ADDED Requirements

### Requirement: Secrets never reach the client
The system SHALL NOT include the provider key or any session/token secret in any
response body or header returned to the browser. Readiness is reported without
revealing the secret itself.

#### Scenario: Health reports readiness, not the key
- **WHEN** the browser reads the service health
- **THEN** it learns whether a key is configured, never the key's value

#### Scenario: No endpoint echoes a secret
- **WHEN** any endpoint responds
- **THEN** the response contains no provider key and no raw session token

### Requirement: Required secrets are documented
The system SHALL document the environment variables it needs (provider key,
database URL, SMTP, session-affecting settings) in a committed example file that
holds no real values.

#### Scenario: An example env file exists without real secrets
- **WHEN** a new operator sets the service up
- **THEN** an `.env.example` lists the needed variables with placeholder values

### Requirement: Missing production secrets are surfaced, not hidden
The system SHALL make it observable at startup when it runs without a provider
key, so a degraded deployment is noticed rather than silently serving a replay.

#### Scenario: Startup notes a missing key
- **WHEN** the service starts without a provider key configured
- **THEN** it records that it is running keyless (the mode the health endpoint
  already reports)
