# Step 16: Remaining Major Steps

This checkpoint completes the remaining foundation-to-v1 bridge work.

## Continuous Worker

`scripts/process_feedback_queue.py` now runs as a continuous worker by default.

Local one-shot processing:

```bash
python scripts/process_feedback_queue.py --once
```

Local continuous worker:

```bash
python scripts/process_feedback_queue.py --limit 100 --poll-seconds 2
```

The worker exits cleanly on `SIGINT` or `SIGTERM`, which is the behavior Railway expects when stopping or redeploying the worker service.

## Response Viewing

Tenant admins can view recent responses from the admin sidebar. The API intentionally masks PII answers and returns `null` for PII values. Decryption is reserved for a future audited export/decrypt flow behind the `pii:decrypt` permission.

API:

- `GET /tenants/{tenant_id}/responses`

## Analytics V1

The dashboard and analytics screens now read a live summary from response data:

- Total responses
- Average NPS
- Average CSAT
- Active channels

API:

- `GET /tenants/{tenant_id}/analytics/summary`

## PWA and Kiosk Baseline

The frontend includes a web app manifest and icon for installable PWA behavior.

Kiosk mode is enabled by adding `?kiosk=1` to a public feedback URL:

```text
/f/{channel_code}?kiosk=1
```

After submit, the thank-you screen shows a countdown, clears in-memory answers, and returns to the first question.

## Railway Process Shape

`Procfile` defines three services:

- `api`: runs migrations and starts FastAPI.
- `worker`: continuously processes queued feedback submissions.
- `frontend`: builds and serves the Vite app.

For production, configure these as separate Railway services sharing the same PostgreSQL, Redis, and environment variable set.
