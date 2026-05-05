# Step 5: Tenant User Management APIs

This checkpoint adds tenant-scoped user creation and role assignment.

## Included

- `GET /tenants/{tenant_id}/users`
- `POST /tenants/{tenant_id}/users`
- `POST /tenants/{tenant_id}/users/{user_id}/roles`

## RBAC Behavior

- Requires `user:read` to list tenant users.
- Requires `user:create` to create a tenant user.
- Requires `role:assign` to assign roles.
- Super admin can manage users in any tenant.
- Tenant admin can manage users only in their own tenant.
- Tenant user APIs can assign only tenant-safe roles:
  - `tenant_admin`
  - `location_manager`
  - `analyst`
- `super_admin` and `support_operator` cannot be assigned through tenant-scoped APIs.

## Scope Rules

- `tenant_admin` and `analyst` can use tenant or location scope.
- `location_manager` requires location scope.
- Global scope is not accepted by tenant user APIs.
