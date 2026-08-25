## 1. Lifecycle in the store port + in-memory

- [x] 1.1 Extend `RunStore` and `InMemoryRunStore`: `trashed_at` on `Owned`; `delete` becomes trash (sets time); `restore(run_id, owner)`, `purge(run_id, owner)`, `purge_expired(older_than_seconds)`; `get`/`list_for` exclude trashed; inject a clock (default `time.time`). Verify: unit tests — delete hides but retains; restore brings back; get/list exclude trashed; non-owner refused.
- [x] 1.2 Purge semantics: `purge` permanently removes a trashed run (owner-only); `purge_expired` removes only runs trashed longer ago than the window, keeps recent-trash and live. Verify: unit tests with an injected clock.

## 2. Lifecycle in Postgres

- [x] 2.1 Migration `0002_run_trash.sql`: add `runs.trashed_at TIMESTAMPTZ NULL` + a partial index for live runs. Verify: migrate is idempotent against a local Postgres.
- [x] 2.2 Implement trash/restore/purge/purge_expired + trashed exclusion in `PostgresRunStore`, same contract as in-memory. Verify: Postgres contract tests (skipped in CI, run against a throwaway Postgres).

## 3. Routes

- [x] 3.1 `DELETE /runs/{id}` trashes; `POST /runs/{id}/restore`; `POST /runs/{id}/purge` (owner-only); `GET /runs/{id}/export` (owner-only, `content-disposition: attachment`); `GET /runs` excludes trashed and `GET /runs?trashed=1` lists the owner's trash. Verify: route tests — delete then 404 on fetch but present in trash listing; restore re-lists; purge removes; export owner-only; shared+trashed link stops resolving.

## 4. Front: "mes runs"

- [x] 4.1 `src/app/runs-client.ts`: list (live + trash), share, revoke, trash, restore, purge, export URL (same-origin, credentials). Verify: node tests with a fetch double.
- [x] 4.2 A "Mes runs" panel, shown when signed in: list with open (→ `?run=<id>`), share/revoke, trash; a trash view with restore/purge. Verify: browser test — with a stubbed session + stubbed list, rows render; trashing calls the endpoint and drops the row.

## 5. Backup / restore

- [x] 5.1 `deployment/backup.sh` (`pg_dump`) and `deployment/restore.sh` (`pg_restore`/`psql`), reading connection from env, operable with the service stopped; a short `deployment/BACKUP.md`. Verify: dump → empty database → restore reproduces runs/identities, checked against a throwaway Postgres (documented; not in CI).

## 6. Full-suite verification

- [x] 6.1 `pnpm lint && pnpm type-check && pnpm test && pnpm test:browser && pnpm test:api && pnpm build`; `openspec validate run-persistence --strict`. Verify: all green; Postgres contract tests pass against a throwaway Postgres locally.

## 7. Infra (user actions — documented, not blocking CI)

- [ ] 7.1 Schedule `purge_expired` (a small CLI/endpoint) periodically on Coolify. Verify: trashed runs past the window disappear on schedule.
- [ ] 7.2 Schedule `deployment/backup.sh` and store dumps off-host. Verify: a dump exists off-host and a test restore works.
