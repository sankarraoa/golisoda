# Local Prerequisites

## Required Tools

- Python 3.12
- Docker Desktop or another Docker Engine with Compose support

## Local Services

PostgreSQL and Redis are defined in the root `docker-compose.yml`.

```bash
docker compose up -d postgres redis
```

The current local defaults are:

- PostgreSQL: `localhost:5432`, database `goli_soda`
- Redis: `localhost:6379`

Docker is optional. For a local Homebrew PostgreSQL setup:

```bash
brew install postgresql@16
brew services start postgresql@16
```

If the `goli_soda` role does not exist yet:

```bash
/opt/homebrew/opt/postgresql@16/bin/psql -h localhost -p 5432 -d postgres \
  -c "CREATE ROLE goli_soda WITH LOGIN PASSWORD 'goli_soda_dev_password';"
/opt/homebrew/opt/postgresql@16/bin/createdb -O goli_soda goli_soda
```

For local Redis:

```bash
brew install redis
brew services start redis
redis-cli ping
```

## Backend Setup

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e "backend[dev]"
cp backend/.env.example backend/.env
cd backend
uvicorn app.main:app --reload
```

## Verification

```bash
python scripts/check_prereqs.py
cd backend
pytest
```

`GET /ready` or `GET /health/ready` requires PostgreSQL and Redis to be running.

For split deploy maps and worker commands see `docs/architecture/microservices-router-map.md`.
