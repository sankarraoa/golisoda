# Step 15 - QR Code Download

This step adds server-generated QR code downloads for feedback channels.

## What Exists

- New backend setting:
  - `PUBLIC_FEEDBACK_BASE_URL`
- QR codes encode:
  - `{PUBLIC_FEEDBACK_BASE_URL}/f/{channel_code}`
- Authenticated download endpoints:
  - `GET /tenants/{tenant_id}/channels/{channel_id}/qr.png`
  - `GET /tenants/{tenant_id}/channels/{channel_id}/qr.svg`
- Admin Channels table row actions:
  - open public feedback link
  - download PNG QR
  - download SVG QR

## Local Configuration

For local development:

```text
PUBLIC_FEEDBACK_BASE_URL=http://127.0.0.1:5173
```

For production, set this to the public feedback domain, for example:

```text
PUBLIC_FEEDBACK_BASE_URL=https://feedback.yourdomain.com
```

## Verification

Create or use an existing channel, then download its QR from the Channels table.

The QR code remains stable because it is based on the channel's permanent `channel_code`.
