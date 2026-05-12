"""Entry: Tenant Admin HTTP API (Railway service: `uvicorn app.main_tenant_admin:app`)."""

from app.core.apps import create_tenant_admin_app

app = create_tenant_admin_app()
