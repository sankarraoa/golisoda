# Step 13 - Admin Create Flows

This step adds the first tenant-admin create flows.

## What Exists

- Topbar primary action opens the relevant modal per view:
  - Locations -> Add Location
  - Surveys -> Create Survey
  - Channels -> Create Channel
- Modal forms follow the reference design:
  - no top-right close icon
  - Cancel + primary action footer
  - inline validation error text
- UI creates resources through real backend APIs:
  - `POST /tenants/{tenant_id}/locations`
  - `POST /tenants/{tenant_id}/surveys`
  - `POST /tenants/{tenant_id}/channels`
- Channel create flow can choose a location and a published survey version.
- New backend endpoint:
  - `GET /tenants/{tenant_id}/surveys/versions`

## Local Verification

Open:

```text
http://127.0.0.1:5173/login
```

Sign in and use the sidebar:

- Locations -> Add Location
- Surveys -> Create Survey
- Channels -> Create Channel

After each create, the dashboard data reloads automatically.
