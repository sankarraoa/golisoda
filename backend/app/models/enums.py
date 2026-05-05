from enum import StrEnum


def enum_values(enum_class: type[StrEnum]) -> list[str]:
    return [item.value for item in enum_class]


class TenantStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    OFFBOARDED = "offboarded"


class UserStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    INVITED = "invited"


class BindingScope(StrEnum):
    GLOBAL = "global"
    TENANT = "tenant"
    LOCATION = "location"


class AuditActorType(StrEnum):
    USER = "user"
    SYSTEM = "system"
    WORKER = "worker"


class AuditOutcome(StrEnum):
    SUCCESS = "success"
    DENIED = "denied"
    FAILED = "failed"


class AuditAction(StrEnum):
    TENANT_ACCESS = "tenant_access"
    PII_DECRYPT = "pii_decrypt"
    LOGIN = "login"
    LOGIN_FAILED = "login_failed"
    LOGOUT = "logout"
    TOKEN_REVOKED = "token_revoked"
    USER_CREATED = "user_created"
    ROLE_CHANGED = "role_changed"
    SURVEY_PUBLISHED = "survey_published"
    CHANNEL_CREATED = "channel_created"
    KIOSK_TOKEN_CREATED = "kiosk_token_created"


class QueueStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    DEAD_LETTERED = "dead_lettered"


class SurveyStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class SurveyVersionStatus(StrEnum):
    PUBLISHED = "published"
    ARCHIVED = "archived"


class QuestionType(StrEnum):
    NPS = "nps"
    CSAT = "csat"
    SINGLE_SELECTION = "single_selection"
    MULTI_SELECTION = "multi_selection"
    PLAIN_TEXT = "plain_text"
    DROPDOWN = "dropdown"


class ChannelStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


class ChannelType(StrEnum):
    QR = "qr"
    KIOSK = "kiosk"


class PermissionCode(StrEnum):
    TENANT_CREATE = "tenant:create"
    TENANT_READ = "tenant:read"
    TENANT_UPDATE = "tenant:update"
    TENANT_SUSPEND = "tenant:suspend"
    USER_CREATE = "user:create"
    USER_READ = "user:read"
    USER_UPDATE = "user:update"
    USER_ARCHIVE = "user:archive"
    ROLE_CREATE = "role:create"
    ROLE_READ = "role:read"
    ROLE_UPDATE = "role:update"
    ROLE_ASSIGN = "role:assign"
    LOCATION_CREATE = "location:create"
    LOCATION_READ = "location:read"
    LOCATION_UPDATE = "location:update"
    LOCATION_ARCHIVE = "location:archive"
    BRANDING_READ = "branding:read"
    BRANDING_UPDATE = "branding:update"
    SURVEY_CREATE = "survey:create"
    SURVEY_READ = "survey:read"
    SURVEY_UPDATE = "survey:update"
    SURVEY_COPY = "survey:copy"
    SURVEY_ARCHIVE = "survey:archive"
    SURVEY_PUBLISH = "survey:publish"
    CHANNEL_CREATE = "channel:create"
    CHANNEL_READ = "channel:read"
    CHANNEL_UPDATE = "channel:update"
    CHANNEL_ARCHIVE = "channel:archive"
    RESPONSE_READ = "response:read"
    ANALYTICS_READ = "analytics:read"
    AUDIT_READ = "audit:read"
    PII_DECRYPT = "pii:decrypt"
