# Step 18: Tenant Branding Settings

This checkpoint makes tenant white-labeling editable from the admin UI.

## What Changed

- Dashboard loading now includes `GET /tenants/{tenant_id}/branding`.
- Settings includes a Branding section for:
  - Logo URL
  - Primary color
  - Secondary color
  - Thank-you message
- Saving calls `PATCH /tenants/{tenant_id}/branding`.
- Public feedback pages already consume these values through the public channel context.

## Verification

Frontend build:

```bash
cd frontend
npm run build
```

API smoke:

```bash
GET /tenants/{tenant_id}/branding
PATCH /tenants/{tenant_id}/branding
```

Expected result: `200 OK`, and the public `/f/{channel_code}` page reflects the saved branding.
