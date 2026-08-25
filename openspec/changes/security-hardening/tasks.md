## 1. Security headers

- [x] 1.1 Add a FastAPI middleware setting `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` on every response, without dropping `cache-control: no-store`. Verify: route tests — a normal and an error response both carry the three headers and keep no-store on API responses.

## 2. Audit log

- [x] 2.1 `services/api/usine_api/audit.py`: `AuditEntry` + `AuditLog` port + `InMemoryAuditLog`; timestamp via an injected clock. Verify: unit tests — record then read back for an org; entries carry no secret fields by construction.
- [x] 2.2 Wire audit into share/revoke/trash/restore/purge routes (record after success, non-blocking); `GET /audit` returns the caller org's entries (auth required); no edit/delete route exists. Verify: route tests — a destructive/sharing action produces an entry; audit requires sign-in; one org never sees another's.
- [x] 2.3 `PostgresAuditLog` + migration `0003_audit.sql` (`audit_entries`), same contract as in-memory; selected by `create_app` alongside the other Postgres stores. Verify: Postgres contract tests (skipped in CI, run against a throwaway Postgres).

## 3. Secrets hygiene

- [x] 3.1 Add a committed `.env.example` (repo root) listing needed vars with placeholders (OPENROUTER_API_KEY, DATABASE_URL, SMTP_*, USINE_ORIGIN, RELAY_PORT, USINE_MODEL); a startup log when the service runs keyless. Verify: `.env.example` holds no real values; a test asserts health reports readiness without exposing the key, and no endpoint echoes a secret.

## 4. Threat model

- [x] 4.1 Write `docs/8-THREAT-MODEL.md` covering the sandbox, the service/relay, trace import as hostile data, sharing by link, and passwordless auth — each with threat, mitigation, residual risk — plus the two honesty guardrails as scope limits. Verify: the document exists and covers each named surface.

## 5. Full-suite verification

- [x] 5.1 `pnpm lint && pnpm type-check && pnpm test && pnpm test:browser && pnpm test:api && pnpm build`; `openspec validate security-hardening --strict`. Verify: all green; Postgres contract tests pass against a throwaway Postgres locally.

## 6. Deferred (ops/infra — documented, not blocking CI)

- [ ] 6.1 Commission an external penetration test against the deployed service; track findings and re-test. Verify: a report exists and blockers are resolved.
- [ ] 6.2 Document and schedule provider-key rotation. Verify: a rotation runbook exists and has been exercised once.
