# Step 08 - Feedback Submission Pipeline

This step adds the first production-shaped public feedback write path.

## What Exists

- `POST /public/{channel_code}/submit`
- `POST /f/{channel_code}/submit`
- Edge validation against the published `survey_versions.schema_snapshot`
- Optional `Idempotency-Key` header, scoped by `channel_code`
- Durable enqueue into `feedback_submission_queue`
- Worker scaffold that claims pending rows and writes:
  - `responses`
  - `response_answers`
- Dead-letter capture after repeated processing failures

The API returns `202 Accepted` with only:

```json
{"submitted": true, "thank_you_text": "Thanks"}
```

## Run Locally

Apply migrations:

```bash
alembic -c backend/alembic.ini upgrade head
```

Submit feedback:

```bash
curl -s -X POST "http://localhost:8000/f/$CHANNEL_CODE/submit" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-submit-001" \
  -d '{"locale":"en","answers":[{"question_key":"nps","value":9}],"metadata":{"source":"smoke"}}'
```

Process the queue once:

```bash
python scripts/process_feedback_queue.py --limit 10 --worker-id local-worker
```

## Verification

Run:

```bash
ruff check backend scripts
pytest backend/tests
```

The worker is intentionally a script right now so it can run locally and later become a separate Railway service without changing the queue contract.
