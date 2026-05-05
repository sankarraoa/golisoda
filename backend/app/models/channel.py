from uuid import UUID

from sqlalchemy import Enum, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UuidPrimaryKeyMixin
from app.models.enums import ChannelStatus, ChannelType, enum_values


class FeedbackChannel(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "feedback_channels"
    __table_args__ = (
        UniqueConstraint("channel_code", name="uq_feedback_channels_channel_code"),
        UniqueConstraint("tenant_id", "name", name="uq_feedback_channels_tenant_name"),
        Index("ix_feedback_channels_tenant_location", "tenant_id", "location_id"),
        Index("ix_feedback_channels_tenant_status", "tenant_id", "status"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    location_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    survey_version_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("survey_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    survey_template_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("survey_templates.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    channel_code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    channel_type: Mapped[ChannelType] = mapped_column(
        Enum(ChannelType, name="channel_type", values_callable=enum_values),
        nullable=False,
        default=ChannelType.QR,
    )
    status: Mapped[ChannelStatus] = mapped_column(
        Enum(ChannelStatus, name="channel_status", values_callable=enum_values),
        nullable=False,
        default=ChannelStatus.ACTIVE,
    )
    qr_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
