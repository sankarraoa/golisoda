# Microservices router map

This repo can run as a **single monolith** (`app.main:app`) or as **four HTTP services** plus an optional **feedback worker**, sharing one PostgreSQL database and one Alembic migration line (Phase 1).

Super-admin **login and `/platform/*` APIs** are intentionally **not** implemented yet; [`app/main_platform_admin.py`](../backend/app/main_platform_admin.py) exposes health/readiness + metrics only until that work lands.

## Processes and entrypoints

| Process | Uvicorn module | Routers / scope |
|--------|----------------|-----------------|
| **Monolith** (default local) | [`app.main:app`](../backend/app/main.py) | All routers (auth, uploads, tenants, surveys, channels, survey-templates, responses, public, health). |
| **Public Feedback** | [`app.main_public_feedback:app`](../backend/app/main_public_feedback.py) | `public` (`/f/*`, `/public/*`), `health`. |
| **Template Admin** | [`app.main_template_admin:app`](../backend/app/main_template_admin.py) | `survey-templates`, `health`. |
| **Tenant Admin** | [`app.main_tenant_admin:app`](../backend/app/main_tenant_admin.py) | `auth`, `uploads`, `tenants`, `surveys`, `channels`, `responses`, `health`. |
| **Platform Admin** (stub) | [`app.main_platform_admin:app`](../backend/app/main_platform_admin.py) | `health` only until platform routes exist. |
| **Feedback worker** (no HTTP) | `goli-feedback-worker` → [`app.cli.run_feedback_worker`](../backend/app/cli/run_feedback_worker.py) | Drains `FeedbackSubmissionQueue` via `process_feedback_submission_batch`. |

Factory functions live in [`app/core/apps.py`](../backend/app/core/apps.py).

## Health probes

- `GET /health` and `GET /health/live` — liveness (always 200 if process up).
- `GET /ready` and `GET /health/ready` — readiness; body includes `service` (from env `SERVICE_NAME` or config `service_name`) and `checks.database` / `checks.redis`.

## Frontend environment variables (split deploy)

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | Tenant Admin API (login, `/tenants/*`, etc.). |
| `VITE_PUBLIC_FEEDBACK_API_URL` | Public Feedback API for `/f/*` (defaults to `VITE_API_BASE_URL`). |
| `VITE_TEMPLATE_API_BASE_URL` | Template Admin API for `GET /survey-templates` (defaults to `VITE_API_BASE_URL`). |

## Branding / uploads (split deploy note)

Logo **upload** (POST) runs on **Tenant Admin**. `GET /uploads/branding/{tenant_id}/{filename}` is served from the same service. Set backend **`API_PUBLIC_ORIGIN`** (or `api_public_origin`) to the **Tenant Admin public base URL** so `logo_url` stored in the DB points at the process that actually has the files on disk—unless you introduce shared object storage.

For a **monolith**, all of that remains a single origin.

## Production queue processing

Set **`FEEDBACK_PROCESS_INLINE=false`** on the Public Feedback service so submit does not drain the queue in-request. Run **`goli-feedback-worker`** as a separate Railway service (same `DATABASE_URL`, `REDIS_URL`, secrets as APIs).

## Railway (summary)

- One GitHub repo → one Railway **project** → multiple **services** (each with its own start command and `SERVICE_NAME`).
- Run **Alembic once** per deploy (release command or CI), not from every web process on boot.
- Single-host path routing is not built into Railway; use **per-service public URLs** plus the Vite env vars above, or add a small reverse-proxy service / external edge (e.g. Cloudflare) if you need one `api.` host.
