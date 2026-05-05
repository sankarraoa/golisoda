# Step 17: Tenant User Management UI

This checkpoint adds the tenant admin user-management surface.

## What Changed

- The admin sidebar now includes `Users`.
- Dashboard loading includes `GET /tenants/{tenant_id}/users`.
- The Users list shows name, email, role, location scope, status, and created date.
- The `Add User` modal creates a user, then assigns a tenant or location-scoped role.

## Supported Roles

- `tenant_admin`: tenant-scoped.
- `analyst`: tenant-scoped.
- `location_manager`: location-scoped and requires a selected location.

## Verification

Frontend build:

```bash
cd frontend
npm run build
```

API smoke:

```bash
GET /tenants/{tenant_id}/users
```

Expected result: `200 OK` with the current tenant's users.
