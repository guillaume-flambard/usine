## Purpose

Durcir les réponses du service par des en-têtes standards, pour qu'un navigateur
refuse de lui-même le détournement de type, l'encadrement en iframe et la fuite
de référent — une défense en profondeur qui ne coûte rien à la démo.

## ADDED Requirements

### Requirement: Service responses carry hardening headers
The service SHALL set, on every HTTP response, at least: `X-Content-Type-Options:
nosniff`, `Referrer-Policy: no-referrer`, and a frame-ancestors control that
forbids the service's own JSON from being framed (`X-Frame-Options: DENY`). These
SHALL NOT weaken the existing `cache-control: no-store` on API responses.

#### Scenario: A normal response is hardened
- **WHEN** any service endpoint responds
- **THEN** the response carries `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, and `X-Frame-Options: DENY`

#### Scenario: An error response is hardened too
- **WHEN** an endpoint responds with an error status
- **THEN** the same hardening headers are present

### Requirement: The sandbox frame policy stays explicit
The system SHALL keep the sandboxed application frame's Content-Security-Policy
naming its host origin explicitly (an opaque-origin frame does not match
`script-src 'self'`), so hardening the service does not break the bridge the
atelier depends on.

#### Scenario: The frame policy is documented and unchanged in intent
- **WHEN** the security headers are applied to the service
- **THEN** the sandbox frame's own CSP still names its host explicitly, unbroken
