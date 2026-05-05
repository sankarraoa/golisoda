# Step 3: User Management Foundation

This checkpoint adds the first authentication and RBAC foundation.

## Included

- Argon2 password hashing.
- JWT access token creation and validation.
- Redis-backed refresh token storage.
- Refresh token rotation and reuse detection.
- Login, refresh, logout, and current-user endpoints.
- Permission-code enum usage.
- Principal loading with role, permission, tenant, and location scope.
- Idempotent development seed data.

## Local Seed

```bash
source .venv/bin/activate
python scripts/seed_dev.py
```

Seeded users:

- `superadmin@example.com` / `Admin@12345`
- `admin@example.com` / `Admin@12345`

## Smoke Test

```bash
curl -s http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@example.com","password":"Admin@12345"}'
```

Redis must be running for login and refresh token flows.
