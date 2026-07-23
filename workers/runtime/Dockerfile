# syntax=docker/dockerfile:1
#
# Prod image for the data-plane supervisor (R1, docs/cost-plan.md). Build
# from the monorepo root:
#   docker build -f workers/runtime/Dockerfile -t botmarket-runtime .
#
# Must be built from the repo root, not workers/runtime: catalog/base.py's
# SCHEMAS_DIR resolves packages/schemas as *four levels up* from itself
# (workers/runtime/catalog -> workers/runtime -> workers -> repo root), so
# the image has to keep that same relative layout under /app.

FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS builder
WORKDIR /app/workers/runtime

# Lockfile + manifest only, so this layer is cached across source changes.
# --no-install-project: there's no [build-system] in pyproject.toml (this
# app isn't a distributable package — supervisor.py runs directly, imports
# resolved via the "pythonpath = ['.']" convention pytest already uses), so
# nothing would install for the project itself either way; the flag just
# keeps intent explicit and matches uv's standard Docker layering pattern.
COPY workers/runtime/pyproject.toml workers/runtime/uv.lock workers/runtime/.python-version ./
RUN uv sync --locked --no-dev --no-install-project

# ---- runner ----
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS runner
RUN groupadd --system supervisor && useradd --system --gid supervisor supervisor

WORKDIR /app/workers/runtime
COPY --from=builder --chown=supervisor:supervisor /app/workers/runtime/.venv ./.venv
COPY --chown=supervisor:supervisor workers/runtime/supervisor.py workers/runtime/tokenbox.py workers/runtime/keygen.py workers/runtime/db.py ./
COPY --chown=supervisor:supervisor workers/runtime/catalog ./catalog
# packages/schemas — see the SCHEMAS_DIR note up top; path relative to /app
# must mirror the repo layout, not sit under workers/runtime.
COPY --chown=supervisor:supervisor packages/schemas /app/packages/schemas

ENV PATH="/app/workers/runtime/.venv/bin:$PATH"
USER supervisor

# Real runtime secrets (DATABASE_URL, TOKEN_SEAL_PRIVATE_KEY) come from the
# prod compose file's environment — never baked into this image.
CMD ["python", "supervisor.py"]
