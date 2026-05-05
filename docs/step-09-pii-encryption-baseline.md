# Step 09 - PII Encryption Baseline

This step adds the application-level encryption baseline for PII answers.

## What Exists

- Per-tenant Data Encryption Keys (DEKs) in `pii_key_registry`
- DEKs encrypted by `PII_MASTER_KEY`
- AES-256-GCM envelope encryption
- `enc:v1:` encrypted value format for stored PII answer values
- Worker integration:
  - PII answers store encrypted `raw_value`
  - PII answers store `value_json = null`
  - Non-PII answers keep plaintext `raw_value` and analytics-friendly `value_json`

## Key Model

`PII_MASTER_KEY` comes from the environment and should be a base64 encoded 32-byte secret:

```bash
python -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
```

For local development, non-base64 secrets are hashed into a 32-byte key so the app remains easy to run. Production should use a generated 32-byte secret and rotate it with a planned migration process.

## Verification

Run:

```bash
ruff check backend scripts
pytest backend/tests
```

## Current Scope

This baseline encrypts PII at the feedback-worker write path. Decryption helpers exist for controlled future use, but no API endpoint currently exposes decrypted PII.
