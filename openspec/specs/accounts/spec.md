# accounts Specification

## Purpose
Donner une identité aux visiteurs de l'atelier via une connexion par lien
magique (email), sans mot de passe et sans tiers, pour que les runs cessent
d'être anonymes et puissent appartenir à quelqu'un.

## Requirements

### Requirement: Passwordless sign-in by email magic link
The system SHALL let a person sign in by entering an email address and following
a single-use, time-limited link sent to that address. The system SHALL NOT store
any password, and the sign-in secret (the link token) SHALL NOT be readable by
the client beyond the one-time redemption.

#### Scenario: Requesting a link
- **WHEN** a person submits an email to sign in
- **THEN** the system creates a single-use token bound to that email, valid for a
  bounded time, and sends the link by email
- **AND** the response reveals neither the token nor whether the email already
  had an account (no account enumeration)

#### Scenario: Redeeming a valid link
- **WHEN** a person follows a valid, unexpired, unused link
- **THEN** the system establishes an authenticated session for that email
- **AND** the token is marked used and cannot be redeemed again

#### Scenario: Redeeming an invalid or expired link
- **WHEN** a person follows a token that is expired, already used, or unknown
- **THEN** no session is established and the failure is reported without
  revealing which of the three it was

### Requirement: Sessions authenticate later requests
The system SHALL carry the authenticated identity across requests by a session
credential that the browser cannot read as script (HTTP-only), and SHALL let a
person sign out, ending the session.

#### Scenario: An authenticated request is attributed
- **WHEN** a request carries a valid session
- **THEN** the service resolves it to the signed-in identity

#### Scenario: Signing out ends the session
- **WHEN** a signed-in person signs out
- **THEN** the session is invalidated and later requests with it are unauthenticated

### Requirement: Sign-in requests are rate limited
The system SHALL bound how many magic-link requests an address (IP) may trigger,
reusing the existing rate limiter, so the email channel cannot be abused.

#### Scenario: Too many link requests
- **WHEN** an address requests links past the bound
- **THEN** further requests are refused with a clear message, no email is sent
