# Step 12 - Tenant Admin List Views

This step turns the admin shell into a usable tenant-admin navigation surface.

## What Exists

- Sidebar navigation switches views without a page reload
- Dynamic topbar title and primary action label per view
- Dashboard view with stat cards and recent tables
- Locations list view using real backend location data
- Surveys list view using real backend survey data
- Channels list view using real backend channel data
- Analytics placeholder with current tenant counts
- Settings placeholder showing the signed-in user and tenant context
- Filter bars, tabs, status badges, pagination shells, and hover-only row actions aligned to the provided HTML reference

## Local Verification

Start the backend and frontend, then open:

```text
http://127.0.0.1:5173/login
```

Use:

```text
admin@example.com / Admin@12345
```

After login, use the sidebar to switch between Dashboard, Locations, Surveys, Channels, Analytics, and Settings.

## Build Verification

```bash
cd frontend
npm run build
```
