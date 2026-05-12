# Goli Soda Feedback SaaS

Multi-tenant B2B feedback SaaS for restaurant and retail chains.

## Step 1: Local Prerequisites

This first checkpoint sets up the backend foundation and local infrastructure definitions:

- Python 3.12 backend scaffold with FastAPI.
- PostgreSQL and Redis Docker Compose config.
- Environment templates.
- Health and readiness endpoints.
- Dependency and test tooling.

## Quick Start

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e "backend[dev]"
cd backend
uvicorn app.main:app --reload
```

Health endpoints:

- `GET /health` or `GET /health/live`: process liveness.
- `GET /ready` or `GET /health/ready`: PostgreSQL and Redis readiness (`service` identifies the deploy when `SERVICE_NAME` is set).

### Microservices mode (optional)

Split deploy router→process map: [`docs/architecture/microservices-router-map.md`](docs/architecture/microservices-router-map.md).

Example (from `backend/` with venv activated):

```bash
# Monolith (default)
uvicorn app.main:app --reload

# Split (separate terminals or Railway services)
uvicorn app.main_public_feedback:app --host 0.0.0.0 --port 8001
uvicorn app.main_tenant_admin:app --host 0.0.0.0 --port 8000
uvicorn app.main_template_admin:app --host 0.0.0.0 --port 8002
goli-feedback-worker
```

In production split mode set **`FEEDBACK_PROCESS_INLINE=false`** on Public Feedback and run **`goli-feedback-worker`** next to Postgres/Redis.

Local PostgreSQL and Redis are defined in `docker-compose.yml`. Docker is required to run them locally.

## Database Migrations

Set `DATABASE_URL` in `backend/.env`, then run:

```bash
source .venv/bin/activate
python scripts/check_db.py
alembic -c backend/alembic.ini upgrade head
```

If `DATABASE_URL` is not set, the app defaults to local PostgreSQL at `localhost:5432`.
For Railway, you can paste the Railway Postgres URL directly; `postgresql://...` is normalized to the async SQLAlchemy driver URL automatically.

## Development Seed

```bash
source .venv/bin/activate
python scripts/seed_dev.py
```

Seeded local users:

- `superadmin@example.com` / `Admin@12345`
- `admin@example.com` / `Admin@12345`

## Public Feedback UI

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173/f/<channel_code>` while the backend is running on `http://localhost:8000`.
Use `http://localhost:5173/f/<channel_code>?kiosk=1` for the kiosk reset flow.

Split backends: set `VITE_PUBLIC_FEEDBACK_API_URL` / `VITE_TEMPLATE_API_BASE_URL` (optional; defaults to `VITE_API_BASE_URL`).

## Admin UI

Open `http://localhost:5173/login` and sign in with:

- `admin@example.com` / `Admin@12345`

After login, use the sidebar to switch between Dashboard, Locations, Surveys, Channels, Users, Responses, Analytics, and Settings.
The Locations, Surveys, Channels, and Users views include create modals wired to the backend APIs.
List pages include working search and filter chips.
Location creation auto-generates a code and supports address, searchable city, and searchable state/region inputs.
The Surveys table edit action opens the survey builder for adding questions and publishing.
The Channels table includes QR PNG/SVG download actions.
Settings includes tenant branding controls for the public feedback page.

## Feedback Worker

Prefer the packaged CLI (after `pip install -e backend`):

```bash
source .venv/bin/activate
goli-feedback-worker
```

Equivalent from `backend/` (no globals install needed):

```bash
cd backend
python -m app.cli.run_feedback_worker
```

Optional signal-friendly script (`--once`, custom poll): `scripts/process_feedback_queue.py`.

## Railway Services

The root `Procfile` defines `api`, `worker`, and `frontend` for a **monolith** deployment. Split deploy maps and per-service uvicorn targets are documented in [`docs/architecture/microservices-router-map.md`](docs/architecture/microservices-router-map.md). Use the same PostgreSQL, Redis, and JWT/env secrets across HTTP services plus the worker.
