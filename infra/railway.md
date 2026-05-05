# Railway Foundation Notes

Phase 1 expects separate Railway services for:

- API web service
- Worker service
- PostgreSQL
- Redis

Initial required variables:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `JWT_SECRET_KEY`
- `PII_MASTER_KEY`
- `ADMIN_CORS_ORIGINS`
- `ENVIRONMENT`
- `LOG_LEVEL`

Secrets such as JWT keys and PII master keys must be configured through Railway environment variables, not committed to the repository.

The API and worker should share the same codebase but run different commands once the worker is implemented.
