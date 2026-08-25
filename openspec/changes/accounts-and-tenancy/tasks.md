## 1. Identity domain + ports (in-memory)

- [x] 1.1 Add `services/api/usine_api/identity.py`: dataclasses `Account`, `Organization`; `Protocol`s `IdentityStore`, `TokenStore`, `SessionStore`, `EmailSender`; in-memory impls. Verify: unit tests — first sign-in provisions account+personal org, second reuses it; token stored as a hash, single-use, expiring.
- [x] 1.2 Token helpers: opaque token generation + hashing + expiry check, no plaintext persisted. Verify: unit test — a redeemed token cannot be redeemed twice; an expired token is rejected.

## 2. Magic-link sign-in endpoints

- [x] 2.1 `POST /auth/request-link` — accepts an email, creates a token, calls `EmailSender`, always responds the same (no account enumeration), under the existing rate limiter. Verify: tests — identical response for known/unknown email; email sender invoked with a link; over-limit refused with no send.
- [x] 2.2 `POST /auth/redeem` (or GET link → session) — redeems a valid token into a session; refuses expired/used/unknown uniformly. Verify: tests — valid token opens a session; the three failure cases return the same refusal.

## 3. Sessions + identity dependency

- [x] 3.1 Session cookie: HTTP-only, `Secure`, `SameSite=Lax`, signed; `require_identity` FastAPI dependency resolving the cookie to an identity or 401. Verify: tests — a request with a valid session resolves the identity; none/invalid → 401.
- [x] 3.2 `POST /auth/logout` invalidates the session. Verify: test — after logout the same cookie is unauthenticated.

## 4. Tenancy on runs

- [x] 4.1 Extend the `RunStore` port with ownership: `put(run_id, archive, owner)`, `get(run_id, viewer)`, `list(owner)`, `share/revoke/delete(run_id, owner)`; update `InMemoryRunStore`. The stored archive events stay byte-for-byte unchanged. Verify: unit tests — owner reads own; other org gets None (404 semantics); events unchanged.
- [x] 4.2 Wire routes: `POST /runs` requires identity and records owner; `GET /runs/{id}` resolves for owner OR when shared; `GET /runs` lists owner's; `POST /runs/{id}/share` + `/revoke` + `DELETE /runs/{id}` owner-only. Anonymous demo path and shared-link path still work. Verify: tests — private by default; cross-org read is 404; share enables/revoke disables the link; non-owner admin refused.

## 5. PostgreSQL adapters + migrations

- [x] 5.1 Add versioned SQL migrations for accounts, organizations, magic_link_tokens, sessions, run_ownership; add `psycopg`/driver dep. Verify: `ruff` clean; migration files apply against a local Postgres (documented command).
- [x] 5.2 Postgres impls of the four identity ports + the run-ownership store, selected by env vars in `create_app`; in-memory remains the default. Verify: the existing port contract tests run against the in-memory impl in CI; a note documents how to run them against Postgres locally. No live DB required for CI green.

## 6. Email sender

- [x] 6.1 `EmailSender`: a dev impl that logs the link (no send), and an SMTP impl selected by env. Verify: unit test on the dev logger; SMTP impl behind the port, not exercised in CI.

## 7. Front: auth + gated persistence

- [x] 7.1 `src/app/auth-client.ts`: request link, session status, logout (same-origin, credentials included). Verify: node tests with a fetch double.
- [x] 7.2 Sign-in affordance in the brand/status line; show signed-in email; logout. Verify: browser test — signed-out shows sign-in; after a stubbed session, shows the email.
- [x] 7.3 Gate persist/share on auth: a signed-out visitor still runs the demo and opens shared links, but storing/sharing prompts sign-in. Verify: browser test — demo runs signed-out; the share action prompts sign-in when unauthenticated.

## 8. Full-suite verification

- [ ] 8.1 Run `pnpm lint && pnpm type-check && pnpm test && pnpm test:browser && pnpm test:api && pnpm build`. Verify: all green; `openspec validate accounts-and-tenancy --strict` passes; cordis boundary intact.

## 9. Infra (user actions, out of code scope — documented, not blocking CI)

- [ ] 9.1 Provision PostgreSQL on Coolify and set its env vars. Verify: service starts with the Postgres adapters and stores a run.
- [ ] 9.2 Configure SMTP env for the magic-link email in production. Verify: a real link email is received end-to-end.
