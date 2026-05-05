# Step 6: Survey Foundation APIs

This checkpoint adds survey draft and publish foundations.

## Included

- `GET /tenants/{tenant_id}/surveys`
- `POST /tenants/{tenant_id}/surveys`
- `GET /tenants/{tenant_id}/surveys/{survey_id}`
- `POST /tenants/{tenant_id}/surveys/{survey_id}/questions`
- `POST /tenants/{tenant_id}/surveys/{survey_id}/publish`

## Data Model

- `surveys`
- `questions`
- `question_options`
- `survey_versions`
- `translations`

Publishing creates an immutable `survey_versions.schema_snapshot` JSONB document containing the survey metadata, questions, and options at publish time.

## RBAC

- `survey:create`
- `survey:read`
- `survey:update`
- `survey:publish`

Tenant admins receive all survey permissions in the development seed. Analysts receive `survey:read`.
