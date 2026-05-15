# Railway Deployment Notes

This repo is a monorepo. Deploy it to Railway as separate services that point at the
same GitHub repository:

- API web service, root directory `backend`, config files `backend/railway.toml`
  (deploy: Alembic + healthcheck), **`backend/railpack.json`** (Python 3.12 + uvicorn
  start command), and **`backend/requirements.txt`** (`-e .` so Railpack installs
  from `pyproject.toml` after the full tree is present; avoid early `pip install .`)
- Frontend web service, root directory `frontend`, config files `frontend/railway.toml`
  and **`frontend/railpack.json`** (`deploy.startCommand`: **`npm run preview`**). **`vite.config.ts`**
  sets **`preview.allowedHosts: true`** and **`preview.host` / `preview.port`** from **`PORT`**
  so Railway healthchecks (`healthcheck.railway.app`) succeed. Omitting a start command can leave
  nothing listening → edge **“Application failed to respond.”**
- Worker service, root directory `backend`, start command `python -m app.cli.run_feedback_worker`
- PostgreSQL database service
- Redis database service

Railway's monorepo docs recommend setting a service root directory for isolated
projects, and config files in a monorepo must be referenced by absolute repo path
such as `/backend/railway.toml`.

## Add PostgreSQL (so `DATABASE_URL` resolves)

If the API has `DATABASE_URL=${{ Postgres.DATABASE_URL }}` (or similar) but **no
PostgreSQL service** exists in the project, the reference resolves to an **empty
string**, Alembic pre-deploy fails, and SQLAlchemy cannot parse the URL.

1. In the Railway project: **New** → **Database** → **PostgreSQL** (add one instance).
2. The reference syntax is **`${{ <ServiceName>.DATABASE_URL }}`**, where **`ServiceName`**
   matches the Postgres service **name on the canvas** (e.g. `Postgres` by default).
   If you rename the database service, **update the variable reference** to match.
3. Open your **API** service → **Variables** → set `DATABASE_URL` using **Variable Reference**
   to that database’s `DATABASE_URL` (the UI picker avoids typos).
4. Redeploy the API (pre-deploy migrations need a non-empty URL).

Add **Redis** the same way (`New` → **Database** → **Redis**) and point `REDIS_URL`
at **`${{ <RedisServiceName>.REDIS_URL }}`** (or the URL field your Redis plugin exposes).

## API Variables

Set these on the API service:

- `DATABASE_URL`
- `DATABASE_SSL` (optional; `true`/`false` — overrides automatic TLS for asyncpg)
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
PostgreSQL and Redis services. The API turns `postgres://` / `postgresql://` into
`postgresql+asyncpg://` and strips `sslmode` from the URL (TLS uses `connect_args`;
see troubleshooting if you hit asyncpg SSL errors).

## Frontend Variables

Set these on the frontend service before building:

- `VITE_API_BASE_URL=https://<api-domain>`
- `VITE_PUBLIC_FEEDBACK_API_URL=https://<api-domain>`
- `VITE_TEMPLATE_API_BASE_URL=https://<api-domain>`
- `VITE_PLATFORM_API_BASE_URL=https://<api-domain>` if using platform admin routes

After Railway creates public domains, update the API service:

- `ADMIN_CORS_ORIGINS=https://<frontend-domain>` (comma-separated if the SPA is reachable on more than one origin, e.g. tenant UI + platform custom domain)
- `PUBLIC_FEEDBACK_BASE_URL=https://<frontend-domain>`
- `API_PUBLIC_ORIGIN=https://<api-domain>`

## Platform admin URL (`/platform`)

The tenant and platform UIs ship in the **same** frontend build (`/` vs `/platform`). The path
`/platform` does not create a separate hostname by itself.

To use a **different hostname** (e.g. `platform-frontend-production-…up.railway.app` or
`platform.yourdomain.com`) while still serving this app:

1. Railway → **frontend** service → **Networking** → **Custom domains** → add your domain
   and complete DNS (CNAME / target Railway shows). Railway’s [custom domain docs](https://docs.railway.com/deploy/exposing-your-app#custom-domains)
   apply; the app continues to resolve `/platform` on that host.
2. Update the **API** `ADMIN_CORS_ORIGINS` to include **every** browser origin that loads the admin SPA
   (comma-separated), including the new platform URL origin if it differs from the main frontend URL.
3. Optional: rename the service in Railway; some setups regenerate a friendlier default
   `*.up.railway.app` label—**custom domains** are the reliable way to get a stable `platform-…` name.

A **second** frontend service (duplicate deploy) is only needed if you want a physically separate
deployment; it is not required for a separate *URL* when one service can expose multiple domains.

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

Managed Postgres (including Railway’s plugin) usually **requires TLS**. The app
**strips `sslmode` / `ssl` from `DATABASE_URL`**: SQLAlchemy would otherwise pass them
into `asyncpg.connect()`, which does not accept **`sslmode`** as a keyword (you would
see `TypeError: unexpected keyword argument 'sslmode'`). TLS uses **`connect_args`**
with an **`ssl.SSLContext`** (verification disabled for Railway’s endpoint; **`ssl=True`**
alone can fail cert checks). Apply when **`RAILWAY_ENVIRONMENT`** is set and the host is
not localhost. Override with **`DATABASE_SSL=true|false`** if needed.

Use the **`DATABASE_URL`** reference from your Postgres service (`${{ Postgres.DATABASE_URL }}`
or the equivalent). If **`DATABASE_URL` is missing, empty, or only whitespace**, the app falls back
to the bundled **localhost** dev URL and pre-deploy Alembic cannot reach Railway Postgres.
Do not wrap the reference in extra quotes. **`Could not parse SQLAlchemy URL`** often meant an
empty `DATABASE_URL`; the normalizer validates the URL and fails with a clearer message.

**Frontend `npm run build` fails in Railpack / Lightning CSS**

Vite 8 may minify CSS with Lightning CSS, which can error on valid `@keyframes` (e.g. jewelry
thank-you animations). This repo sets **`build.cssMinify: "esbuild"`** in **`frontend/vite.config.ts`**
so production builds complete on Railway.

- **Wrong target port:** In **Networking**, set **Target port** to the same port Vite prints at
  startup (usually **`$PORT`** from Railway — often **8080**, not **8000**).
- **`vite preview` + healthcheck host:** Without **`preview.allowedHosts`** in **`vite.config.ts`**,
  Vite can return **503** for **`Host: healthcheck.railway.app`**. This repo enables
  **`preview.allowedHosts: true`** and binds **`0.0.0.0`**.
- **No start command:** If **`railpack.json` / `railway.toml`** omit **`npm run preview`**, Railpack
  may not serve the SPA on a port Railway routes to — restore the documented start command.

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
