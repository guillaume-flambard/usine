#!/usr/bin/env bash
# The one list of checks. The VPS builder runs it inside Dockerfile.verify on
# every PR and branch head; the local hooks (MEM-5) run the same file. A check
# that only runs in one place drifts.
set -Eeuo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n==> %s\n' "$*"; }

step "lint (oxlint, eslint, ruff)"
pnpm run lint
step "build (vue-tsc, vite)"
pnpm run build
step "web tests (node)"
pnpm run test
step "web tests (browser)"
pnpm run test:browser
if [[ "${USINE_VERIFY_PG:-}" == 1 ]]; then
  # Inside Dockerfile.verify only: a throwaway Postgres, so the integration
  # tests run in CI instead of being skipped. The password is random and lives
  # only in this process.
  step "throwaway postgres for the integration tests"
  cluster=$(pg_lsclusters --no-header | awk 'NR==1 {print $1" "$2}')
  # shellcheck disable=SC2086
  pg_ctlcluster $cluster start
  pg_password=$(python3 -c 'import secrets; print(secrets.token_urlsafe(18))')
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -c \"CREATE ROLE usine LOGIN PASSWORD '${pg_password}'\""
  su postgres -c "createdb -O usine usine"
  export USINE_TEST_DATABASE_URL="postgresql://usine:${pg_password}@127.0.0.1:5432/usine"
fi

step "api tests (pytest)"
pnpm run test:api
step "uv lock is current"
uv lock --check

printf '\nverify: all checks passed\n'
