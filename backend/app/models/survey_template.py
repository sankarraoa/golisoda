from sqlalchemy import Boolean, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UuidPrimaryKeyMixin


class SurveyTemplate(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Global (non-tenant) presentation template catalog."""

    __tablename__ = "survey_templates"
    __table_args__ = (UniqueConstraint("slug", name="uq_survey_templates_slug"),)

    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    deployment_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    presentation: Mapped[dict] = mapped_column(JSONB, nullable=False)
    theme: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
