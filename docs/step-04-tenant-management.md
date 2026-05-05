# Step 4: Tenant, Location, and Branding APIs

This checkpoint adds the first tenant-scoped admin APIs.

## Included

- `POST /tenants`
- `GET /tenants/{tenant_id}`
- `GET /tenants/{tenant_id}/branding`
- `PATCH /tenants/{tenant_id}/branding`
- `GET /tenants/{tenant_id}/locations`
- `POST /tenants/{tenant_id}/locations`

## RBAC Behavior

- Super admin can create tenants and access any tenant.
- Tenant admin can access only their own tenant.
- Tenant/location/branding APIs require matching permission codes.
- Cross-tenant access returns `403`.

## Smoke Test

Login as `admin@example.com`, copy the access token, then call:

```bash
curl -s http://localhost:8000/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

Use the returned `tenant_id`:

```bash
curl -s http://localhost:8000/tenants/$TENANT_ID/locations \
  -H "Authorization: Bearer $TOKEN"
```
