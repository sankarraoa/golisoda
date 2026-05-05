# Step 1: Foundation Prerequisites

This checkpoint prepares the local project for iterative backend delivery.

## Included

- FastAPI backend scaffold.
- Health and readiness endpoints.
- Structured logging and request ID middleware.
- Prometheus metrics endpoint.
- PostgreSQL and Redis Compose services.
- Python dependency manifest.
- Environment variable template.
- Basic health test.

## Not Included Yet

- Database models and migrations.
- Auth and RBAC.
- Tenant/location CRUD.
- Worker implementation.

Those are intentionally deferred to the next checkpoints so each layer can be tested and corrected independently.
