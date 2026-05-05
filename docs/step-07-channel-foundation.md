# Step 7: QR and Channel Foundation APIs

This checkpoint connects a stable channel code to a tenant, location, and published survey version.

## Included

- `POST /tenants/{tenant_id}/channels`
- `GET /tenants/{tenant_id}/channels`
- `GET /public/{channel_code}`
- `GET /f/{channel_code}`

## Data Model

- `feedback_channels`

Each channel stores:

- `tenant_id`
- `location_id`
- `survey_version_id`
- short URL-safe `channel_code`
- `channel_type`, currently `qr` or `kiosk`
- lifecycle `status`

## Channel Codes

Channel codes are generated with `secrets.token_urlsafe(8)`, collision-checked before insert, and treated as semi-sensitive identifiers.

## Public Context

The public endpoint returns only the render context needed by the feedback page:

- tenant branding
- location summary
- published survey version snapshot
- question tree

It does not require auth.
