"""Smoke: split FastAPI factories mount expected routes without collisions."""

from fastapi.testclient import TestClient

from app.core.apps import (
    create_platform_admin_app,
    create_public_feedback_app,
    create_template_admin_app,
    create_tenant_admin_app,
)


def test_public_feedback_has_f_and_health() -> None:
    client = TestClient(create_public_feedback_app())
    assert client.get("/health").status_code == 200
    assert client.get("/f/nonexistent-channel").status_code in (403, 404)
    assert client.get("/survey-templates").status_code == 404


def test_tenant_admin_registers_public_feedback_routes_without_db_touch() -> None:
    """Avoid calling GET /f/* in-process (requires AsyncSession wiring with TestClient + DB loop)."""
    client = TestClient(create_tenant_admin_app())
    assert client.get("/health").status_code == 200
    spec = client.get("/openapi.json")
    assert spec.status_code == 200
    paths = spec.json().get("paths") or {}
    assert any("/f/" in route for route in paths)


def test_template_admin_requires_auth() -> None:
    client = TestClient(create_template_admin_app())
    r = client.get("/survey-templates")
    assert r.status_code == 401


def test_platform_admin_has_auth_health_and_guarded_platform_route() -> None:
    client = TestClient(create_platform_admin_app())
    assert client.get("/health").status_code == 200
    assert client.get("/survey-templates").status_code == 404
    assert client.get("/f/x").status_code == 404
    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    assert "/auth/login" in openapi.json().get("paths", {})
    assert client.get("/platform/tenants").status_code == 401
