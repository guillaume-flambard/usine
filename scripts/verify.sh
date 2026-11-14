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
step "api tests (pytest)"
pnpm run test:api
step "uv lock is current"
uv lock --check

printf '\nverify: all checks passed\n'
