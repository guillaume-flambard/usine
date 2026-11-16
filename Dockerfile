# The production image (MEM-58): one container answers the API and serves the
# page built by Vite. Postgres runs beside it (lab-infra, stacks/usine).
#
# The VPS builder (lab-infra, usine-build-controller) builds this file from a
# `main` commit whose `usine/verify` status is green: the checks already ran in
# Dockerfile.verify, so nothing is tested again here.

# --- the page --------------------------------------------------------------
FROM node:26-trixie AS web
RUN npm install -g corepack@0.36.0 && corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
# build-only: the type check already ran in verify.
RUN pnpm --filter @usine/web run build-only

# --- the Python environment ------------------------------------------------
# The full image has a compiler: zstandard has no wheel for Python 3.15 yet and
# builds from source. The slim runtime below never compiles anything.
FROM python:3.15-trixie AS api
COPY --from=ghcr.io/astral-sh/uv:0.13.8 /uv /usr/local/bin/uv
ENV UV_LOCKED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /src
COPY pyproject.toml uv.lock .python-version ./
COPY services/api/pyproject.toml services/api/
RUN uv sync --no-dev --no-install-workspace
COPY services/api services/api
RUN uv sync --no-dev --no-editable

# --- runtime ---------------------------------------------------------------
FROM python:3.15-slim-trixie
RUN useradd --system --uid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin usine
COPY --from=api /opt/venv /opt/venv
# The package reads its neighbours by path: config/ (the MCP whitelist),
# services/api/{cassettes,compare}. Same layout as the repository.
COPY --from=api /src/services/api /src/services/api
COPY config /src/config
COPY --from=web /src/apps/web/dist /src/web
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    USINE_WEB_DIR=/src/web
WORKDIR /src/services/api
USER usine
EXPOSE 8000
# 127.0.0.1, never localhost: a localhost resolved to IPv6 against an IPv4
# server once gave an inexplicable 404 in production (CLAUDE.md).
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=6 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status == 200 else 1)"]
CMD ["uvicorn", "usine_api.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
