## 1. Per-store erasure + credential purge (ports + in-memory)

- [x] 1.1 Add targeted `forget` to each store: `RunStore.forget_owner(org)`, `TokenStore.forget(email)`, `SessionStore.forget(account)`, `AuditLog.forget(org)`, `IdentityStore.forget(account)` (removes org then account); update in-memory impls. Verify: unit tests — each removes only the target's data, leaves others intact.
- [x] 1.2 Add `TokenStore.purge_expired()` and `SessionStore.purge_expired()` (in-memory), returning counts, with an injected clock. Verify: unit tests — expired removed, unexpired kept.

## 2. Erasure + purge in Postgres

- [x] 2.1 Implement the same `forget` methods and `purge_expired` on the Postgres stores, same contracts. `IdentityStore.forget` deletes org then account in one transaction. Verify: Postgres contract tests (throwaway Postgres) — erasure across stores; another org untouched; expired credentials purged.

## 3. Account routes (data-subject rights)

- [x] 3.1 `GET /account` (access summary: email, org, live/trashed counts); `GET /account/export` (portability: account + all runs, attachment); `DELETE /account` (erasure: coordinate the `forget`s in FK order, then the session no longer authenticates). All auth-required, owner-scoped. Verify: route tests — access/export return own data only; erasure removes runs/sessions/tokens/audit and the session stops authenticating; each refuses when unauthenticated.

## 4. Retention purge command

- [x] 4.1 `usine_api/maintenance.py` with `run_purge()` (trashed runs past window + expired tokens/sessions) runnable via `python -m usine_api.maintenance` against `DATABASE_URL`, reporting counts. Verify: run against a throwaway Postgres removes what is past retention and prints counts.

## 5. Front: my data

- [x] 5.1 `account-client.ts`: summary, export URL, erase (same-origin, credentials). Verify: node tests with a fetch double.
- [x] 5.2 A "mes données" section in the account/mes-runs area: export link + delete-account with an explicit confirmation, then sign-out. Verify: browser test — with a stubbed session, export link present; delete prompts confirmation and, once confirmed, calls erase and returns to signed-out.

## 6. Documents

- [x] 6.1 `docs/9-PRIVACY.md` (register of processing: categories, purpose, retention table, storage location, data-subject rights + how to exercise) and `deployment/DPA-TEMPLATE.md` (sub-processors, security measures). Verify: both exist and cover the required fields.

## 7. Full-suite verification

- [x] 7.1 `pnpm lint && pnpm type-check && pnpm test && pnpm test:browser && pnpm test:api && pnpm build`; `openspec validate data-privacy-compliance --strict`. Verify: all green; Postgres contract tests pass locally.

## 8. Infra (user actions — documented, not blocking CI)

- [ ] 8.1 Schedule `python -m usine_api.maintenance` periodically with a systemd timer on the VPS. Verify: expired credentials and long-trashed runs disappear on schedule.
- [ ] 8.2 Confirm the DPA sub-processors (VPS host, SMTP, reasoning provider) and fill the template. Verify: the DPA names the real sub-processors.
