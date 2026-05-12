from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import Select

from app.core.database import get_session
from app.main import create_app
from app.models.channel import FeedbackChannel
from app.models.enums import ChannelStatus, ChannelType, TenantStatus
from app.models.survey import SurveyVersion
from app.models.survey_template import SurveyTemplate
from app.models.tenant import Location, Tenant, TenantBranding


class _FakeSession:
    def __init__(
        self,
        *,
        channel: FeedbackChannel,
        tenant: Tenant,
        location: Location,
        survey_version: SurveyVersion,
        branding: TenantBranding,
        template: SurveyTemplate,
    ) -> None:
        self._channel = channel
        self._tenant = tenant
        self._location = location
        self._survey_version = survey_version
        self._branding = branding
        self._template = template

    async def scalar(self, query: Select):  # type: ignore[override]
        ent = query.column_descriptions[0].get("entity")
        if ent is FeedbackChannel:
            return self._channel
        if ent is TenantBranding:
            return self._branding
        raise AssertionError(f"Unexpected scalar query entity: {ent}")

    async def get(self, model, _id):  # type: ignore[override]
        if model is Tenant:
            return self._tenant
        if model is Location:
            return self._location
        if model is SurveyVersion:
            return self._survey_version
        if model is SurveyTemplate:
            return self._template
        raise AssertionError(f"Unexpected get model: {model}")


def test_public_feedback_context_includes_effective_theme_field() -> None:
    app = create_app()

    tenant_id = UUID("aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa")
    location_id = UUID("bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb")
    version_id = UUID("cccccccc-cccc-4ccc-cccc-cccccccccccc")
    template_id = UUID("dddddddd-dddd-4ddd-dddd-dddddddddddd")

    channel = FeedbackChannel(
        tenant_id=tenant_id,
        location_id=location_id,
        survey_version_id=version_id,
        survey_template_id=template_id,
        name="Front desk QR",
        channel_code="TESTCODE",
        channel_type=ChannelType.QR,
        status=ChannelStatus.ACTIVE,
        qr_url=None,
        metadata_json={},
    )
    tenant = Tenant(name="T", slug="t", default_locale="en", status=TenantStatus.ACTIVE)
    tenant.id = tenant_id  # type: ignore[assignment]

    location = Location(tenant_id=tenant_id, name="HQ", code="HQ", city=None, region=None, address=None, is_active=True)
    location.id = location_id  # type: ignore[assignment]

    survey_version = SurveyVersion(
        tenant_id=tenant_id,
        survey_id=UUID("eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee"),
        version_number=1,
        schema_snapshot={"survey": {"id": "s1", "title": "Pulse", "slug": "pulse", "description": None, "default_locale": "en"}, "questions": []},
        published_at=datetime.now(UTC),
    )
    survey_version.id = version_id  # type: ignore[assignment]

    branding = TenantBranding(
        tenant_id=tenant_id,
        logo_url=None,
        primary_color=None,
        secondary_color=None,
        thank_you_text="Thanks",
        theme_overrides={},
    )

    template = SurveyTemplate(
        slug="default_stepper",
        name="Stepper",
        description=None,
        deployment_notes=None,
        presentation={},
        theme={"color.brand.primary": "#1a73e8"},
        sort_order=0,
        is_active=True,
    )
    template.id = template_id  # type: ignore[assignment]

    fake_session = _FakeSession(
        channel=channel,
        tenant=tenant,
        location=location,
        survey_version=survey_version,
        branding=branding,
        template=template,
    )

    async def _override_get_session():
        yield fake_session

    app.dependency_overrides[get_session] = _override_get_session

    client = TestClient(app)
    resp = client.get("/f/TESTCODE")
    assert resp.status_code == 200
    payload = resp.json()
    assert "effective_theme" in payload
    assert payload["effective_theme"]["color.brand.primary"] == "#1a73e8"
    assert "branding" in payload and "template" in payload and "questions" in payload and "survey" in payload
    assert "organization" in payload
    assert payload["organization"]["name"] == "T"

