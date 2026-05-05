# Step 14 - Survey Builder

This step adds the first survey-builder workflow in the admin UI.

## What Exists

- Surveys table edit action opens a builder modal.
- Builder loads survey detail from:
  - `GET /tenants/{tenant_id}/surveys/{survey_id}`
- Builder can add questions through:
  - `POST /tenants/{tenant_id}/surveys/{survey_id}/questions`
- Supported question types:
  - NPS
  - CSAT
  - single selection
  - multi selection
  - plain text
  - dropdown
- Option-based questions accept one option per line.
- Questions can be marked required or PII.
- Builder can publish the survey through:
  - `POST /tenants/{tenant_id}/surveys/{survey_id}/publish`

## Local Verification

Open:

```text
http://127.0.0.1:5173/login
```

Sign in, go to Surveys, then click the edit icon on a survey row.

Recommended flow:

1. Create a survey.
2. Open the builder from the Surveys table.
3. Add at least one question.
4. Publish the survey.
5. Create a channel using the new published survey version.
