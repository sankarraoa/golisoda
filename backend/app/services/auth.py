from datetime import UTC, datetime

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.passwords import verify_password
from app.auth.principal import Principal, load_principal
from app.auth.refresh_tokens import (
    RefreshTokenError,
    consume_refresh_token,
    issue_refresh_token,
    revoke_refresh_family,
)
from app.auth.tokens import create_access_token
from app.models.auth import User
from app.models.enums import AuditAction, AuditActorType, AuditOutcome, UserStatus
from app.services.audit import write_audit_log


class AuthError(Exception):
    pass


async def authenticate_user(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    request_id: str | None,
) -> User:
    normalized_email = email.lower()
    user = await session.scalar(select(User).where(User.email == normalized_email))

    if user is None or not verify_password(password, user.password_hash):
        await write_audit_log(
            session,
            actor_type=AuditActorType.SYSTEM,
            actor_id="auth",
            action=AuditAction.LOGIN_FAILED,
            outcome=AuditOutcome.DENIED,
            request_id=request_id,
            metadata={"email": normalized_email},
        )
        raise AuthError("Invalid email or password.")

    if user.status != UserStatus.ACTIVE:
        await write_audit_log(
            session,
            actor_type=AuditActorType.USER,
            actor_id=str(user.id),
            tenant_id=user.tenant_id,
            action=AuditAction.LOGIN_FAILED,
            outcome=AuditOutcome.DENIED,
            request_id=request_id,
            metadata={"reason": "inactive_user"},
        )
        raise AuthError("User is not active.")

    user.last_login_at = datetime.now(UTC)
    await write_audit_log(
        session,
        actor_type=AuditActorType.USER,
        actor_id=str(user.id),
        tenant_id=user.tenant_id,
        action=AuditAction.LOGIN,
        outcome=AuditOutcome.SUCCESS,
        request_id=request_id,
    )
    return user


async def issue_token_pair(
    session: AsyncSession,
    redis: Redis,
    user: User,
    *,
    family_id: str | None = None,
) -> tuple[str, str, int, Principal]:
    principal = await load_principal(session, user)
    access_token, expires_in = create_access_token(
        user_id=principal.user_id,
        email=principal.email,
        tenant_id=principal.tenant_id,
        role_codes=principal.role_codes,
        permission_codes=principal.permission_codes,
        location_ids=principal.location_ids,
        token_version=principal.token_version,
    )
    refresh_token = await issue_refresh_token(
        redis,
        user_id=principal.user_id,
        tenant_id=principal.tenant_id,
        family_id=family_id,
    )
    return access_token, refresh_token, expires_in, principal


async def refresh_token_pair(
    session: AsyncSession,
    redis: Redis,
    *,
    refresh_token: str,
    request_id: str | None,
) -> tuple[str, str, int, Principal]:
    try:
        refresh_session = await consume_refresh_token(redis, refresh_token)
    except RefreshTokenError as exc:
        await write_audit_log(
            session,
            actor_type=AuditActorType.SYSTEM,
            actor_id="auth",
            action=AuditAction.TOKEN_REVOKED,
            outcome=AuditOutcome.DENIED,
            request_id=request_id,
            metadata={"reason": str(exc)},
        )
        raise AuthError("Invalid refresh token.") from exc

    user = await session.get(User, refresh_session.user_id)
    if user is None or user.status != UserStatus.ACTIVE:
        await revoke_refresh_family(redis, refresh_session.family_id)
        raise AuthError("User is not active.")

    return await issue_token_pair(session, redis, user, family_id=refresh_session.family_id)
