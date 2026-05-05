# Step 20: Location Edit and Archive

This checkpoint adds location lifecycle actions.

## What Changed

- Locations now support tenant-scoped updates through:
  - `PATCH /tenants/{tenant_id}/locations/{location_id}`
- The location table hover action is now a single three-dot menu with:
  - Edit
  - Archive
- Archive sets `is_active=false`; it does not delete the row.
- Edit reuses the location form with existing values prefilled.
- Location code generation now uses:
  - Up to 4 alphanumeric characters from the location name
  - A hyphen
  - A random 4-digit suffix

Examples:

- `BLR-4821`
- `ABC-1934` when the entered name only has 3 usable characters

## Verification

```bash
ruff check backend scripts
pytest backend/tests
cd frontend && npm run build
```

Live smoke:

```bash
PATCH /tenants/{tenant_id}/locations/{location_id}
```

Expected result: `200 OK` with edited fields and `is_active=false` when archived.
