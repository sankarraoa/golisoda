# Step 11 - Admin UI Foundation

This step adds the first authenticated admin surface.

## What Exists

- `/login` centered login page
- Local token storage for access/refresh tokens
- Authenticated admin shell with fixed sidebar and sticky topbar
- Tenant dashboard that calls real backend APIs:
  - `GET /auth/me`
  - `GET /tenants/{tenant_id}`
  - `GET /tenants/{tenant_id}/locations`
  - `GET /tenants/{tenant_id}/surveys`
  - `GET /tenants/{tenant_id}/channels`
- Stat cards for locations, surveys, published surveys, and active channels
- Recent channels table with public `/f/{channel_code}` links
- Surveys table with status badges
- Loading skeleton and empty states

## Local Run

Start backend:

```bash
source .venv/bin/activate
cd backend
uvicorn app.main:app --reload
```

Start frontend:

```bash
cd frontend
npm run dev
```

Open:

```text
http://127.0.0.1:5173/login
```

Seeded local credentials:

```text
admin@example.com / Admin@12345
```

## Verification

```bash
cd frontend
npm run build
```

```bash
ruff check backend scripts
pytest backend/tests
```
