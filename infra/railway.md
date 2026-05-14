# Railway Deployment Notes

This repo is a monorepo. Deploy it to Railway as separate services that point at the
same GitHub repository:

- API web service, root directory `backend`, config files `backend/railway.toml`
  (deploy: Alembic + healthcheck), **`backend/railpack.json`** (Python 3.12 + uvicorn
  start command), and **`backend/requirements.txt`** (`-e .` so Railpack installs
  from `pyproject.toml` after the full tree is present; avoid early `pip install .`)
- Frontend web service, root directory `frontend`, config files `frontend/railway.toml`
  and **`frontend/railpack.json`** (explicit preview start command for Railpack)
- Worker service, root directory `backend`, start command `python -m app.cli.run_feedback_worker`
- PostgreSQL database service
- Redis database service

Railway's monorepo docs recommend setting a service root directory for isolated
projects, and config files in a monorepo must be referenced by absolute repo path
such as `/backend/railway.toml`.

## API Variables

Set these on the API service:

- `DATABASE_URL`
- `REDIS_URL`
- `SERVICE_NAME=api`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `JWT_SECRET_KEY`
- `PII_MASTER_KEY`
- `ADMIN_CORS_ORIGINS`
- `PUBLIC_FEEDBACK_BASE_URL`
- `API_PUBLIC_ORIGIN`
- `ENVIRONMENT=production`
- `LOG_LEVEL=INFO`

Use Railway reference variables for `DATABASE_URL` and `REDIS_URL` from the
PostgreSQL and Redis services. The API config normalizes Railway's
`postgresql://...` URL to SQLAlchemy's async driver URL automatically.

## Frontend Variables

Set these on the frontend service before building:

- `VITE_API_BASE_URL=https://<api-domain>`
- `VITE_PUBLIC_FEEDBACK_API_URL=https://<api-domain>`
- `VITE_TEMPLATE_API_BASE_URL=https://<api-domain>`
- `VITE_PLATFORM_API_BASE_URL=https://<api-domain>` if using platform admin routes

After Railway creates public domains, update the API service:

- `ADMIN_CORS_ORIGINS=https://<frontend-domain>`
- `PUBLIC_FEEDBACK_BASE_URL=https://<frontend-domain>`
- `API_PUBLIC_ORIGIN=https://<api-domain>`

## Worker Variables

Set these on the worker service:

- `DATABASE_URL`
- `REDIS_URL`
- `SERVICE_NAME=worker`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `JWT_SECRET_KEY`
- `PII_MASTER_KEY`
- `ENVIRONMENT=production`
- `LOG_LEVEL=INFO`

Secrets such as JWT keys and PII master keys must be configured through Railway environment variables, not committed to the repository.

In production split mode set `FEEDBACK_PROCESS_INLINE=false` on the API once the
worker is running.

## Troubleshooting (Railway diagnosis)

**`alembic` missing / “Directory '.' is not installable”** (build)

A custom Railpack step that runs **`pip install .` too early** can execute before the
project tree is present in the step’s working directory. Use **`backend/requirements.txt`**
with a single line **`-e .`** so Railpack’s normal **`pip install -r requirements.txt`**
runs against the full **service root** (with `pyproject.toml`). **`backend/railpack.json`**
only sets **`packages.python`** and **`deploy.startCommand`** (no `steps.install`
override).

**`alembic: command not found`** (during pre-deploy)

The container may not put the `alembic` CLI on `PATH`. This repo uses
`python -m alembic -c alembic.ini upgrade head` in **`backend/railway.toml`**
(`preDeployCommand`), which uses the same Python environment as the app.

**Alembic `upgrade head` fails during pre-deploy** (asyncpg / SSL / connection)

Managed Postgres (including Railway’s plugin) usually **requires TLS**. The API
normalizes `DATABASE_URL`: `postgres://` and `postgresql://` become
`postgresql+asyncpg://`, stray **`ssl=true`** query params (invalid for asyncpg) are
mapped to **`sslmode=require`**, and when **`RAILWAY_ENVIRONMENT`** is set a default
**`sslmode=require`** is applied for non-localhost URLs if `sslmode` is absent.
Use the **`DATABASE_URL`** reference variable from your Postgres service (`${{ Postgres.DATABASE_URL }}`
or the equivalent). If **`DATABASE_URL` is unset**, the app keeps its localhost dev
default and pre-deploy Alembic cannot reach the database.

**No start command detected** (Railpack log ends with “Specify a start command”)

Railpack looks for **`railpack.json`** in the **directory being built** (see
[Railpack config](https://railpack.com/config/file)). It does **not** use
`railway.toml` for the build plan. This repo’s **`backend/railpack.json`** sets
`deploy.startCommand` to  
`uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`.

**`The working directory "/app" does not exist` or “no providers were detected”**

Railpack built from the **repository root**, so it never saw `backend/pyproject.toml`
and the image may not match Railway’s expected layout.

1. Open the service → **Settings** → set **Root Directory** to `backend` (API or
   worker) or `frontend` (SPA). Redeploy.
2. Prefer letting **`backend/railway.toml`** drive build/deploy for the API
   (`uvicorn app.main:app …` and `preDeployCommand` for Alembic). You do **not**
   need to paste a custom start command unless you are overriding the file.

**If Railway suggests:**

`python -m app.cli.run_feedback_worker`

That command is only for a **dedicated worker** service (queue drainer). For the
**monolith HTTP API**, the start command must remain **`uvicorn app.main:app`**
(as in `backend/railway.toml`). Do not point the main API service at the worker
entrypoint unless that service is intentionally the worker.
