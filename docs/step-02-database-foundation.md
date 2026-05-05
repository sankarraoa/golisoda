# Step 2: Database Foundation

This checkpoint defines the foundation PostgreSQL schema and Alembic migration setup.

## Included Tables

- `tenants`
- `tenant_branding`
- `locations`
- `users`
- `roles`
- `permissions`
- `role_permissions`
- `user_role_bindings`
- `audit_logs`
- `pii_key_registry`
- `feedback_submission_queue`
- `feedback_submission_dead_letters`

## Apply The Migration

Set `DATABASE_URL` in `backend/.env` to either Railway Postgres or a local Postgres instance, then run:

```bash
source .venv/bin/activate
python scripts/check_db.py
alembic -c backend/alembic.ini upgrade head
```

The migration is intentionally PostgreSQL-first because it uses UUID, JSONB, and enum types.
If `DATABASE_URL` is unset, it will try local PostgreSQL at `localhost:5432`.

## Design Notes

- Tenant-scoped tables carry `tenant_id` and tenant indexes.
- Tenants have lifecycle status: `active`, `suspended`, `offboarded`.
- RBAC uses enum-backed permission codes and scoped role bindings.
- Audit logs are modeled as append-only application records.
- PII key metadata is per tenant and versioned.
- Feedback submissions use a durable Postgres-backed queue plus a dead-letter table.
