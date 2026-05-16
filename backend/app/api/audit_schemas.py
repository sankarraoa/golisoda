from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AuditLogEntry(BaseModel):
    id: UUID
    occurred_at: datetime
    actor_type: str
    actor_id: str
    tenant_id: UUID | None
    action: str
    resource_type: str | None = None
    resource_id: str | None = None
    outcome: str
    request_id: str | None = None
    metadata: dict = Field(default_factory=dict)
