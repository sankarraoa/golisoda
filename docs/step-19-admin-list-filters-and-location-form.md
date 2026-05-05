# Step 19: Admin List Filters and Location Form

This checkpoint fixes the admin list filters and improves location creation.

## What Changed

- Search inputs now filter table data in:
  - Locations
  - Surveys
  - Channels
  - Users
  - Responses
- Filter chips now apply real filters instead of being visual-only.
- Location code is auto-generated from city and location name, while still editable before save.
- Location creation now includes an optional address field.
- City and state/region fields use searchable `datalist` inputs.
- Address, city, and state/region are saved through the existing location API and read back into the Locations table.

## Notes

The city field includes common Indian cities as suggestions and still allows typing any Indian city not shown in the suggestion list. The state/region field includes all Indian states and union territories.

## Verification

Frontend build:

```bash
cd frontend
npm run build
```

API smoke:

```bash
POST /tenants/{tenant_id}/locations
```

Expected result: `201 Created` with `address`, `city`, and `region` returned in the response.
