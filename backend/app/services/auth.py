from datetime import UTC, datetime

from redis.asyncio import Redis
from sqlalchemy import case, select
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
from app.models.enums import (
    AuditAction,
    AuditActorType,
    AuditOutcome,
    PermissionCode,
    TenantStatus,
    UserStatus,
)
from app.models.tenant import Tenant
from app.services.audit import write_audit_log


class AuthError(Exception):
    pass


async def _reject_login_unknown(
    session: AsyncSession, *, normalized_email: str, request_id: str | None
) -> None:
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


async def _reject_inactive(session: AsyncSession, user: User, request_id: str | None) -> None:
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


async def _complete_login(
    session: AsyncSession, user: User, *, request_id: str | None
) -> User:
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


async def authenticate_tenant_admin_user(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    request_id: str | None,
) -> User:
    """Tenant Admin SPA: tenant-bound users, or platform super admins (global operators)."""
    normalized_email = email.lower()

    platform_user = await session.scalar(
        select(User).where(User.email == normalized_email, User.tenant_id.is_(None))
    )
    if platform_user is not None and verify_password(password, platform_user.password_hash):
        if platform_user.status != UserStatus.ACTIVE:
            await _reject_inactive(session, platform_user, request_id)
        principal = await load_principal(session, platform_user)
        if PermissionCode.PLATFORM_MANAGE.value not in principal.permission_codes:
            await _reject_login_unknown(
                session,
                normalized_email=normalized_email,
                request_id=request_id,
            )
        return await _complete_login(session, platform_user, request_id=request_id)

    user = await session.scalar(
        select(User).where(User.email == normalized_email, User.tenant_id.is_not(None))
    )

    if user is None or not verify_password(password, user.password_hash):
        await _reject_login_unknown(
            session,
            normalized_email=normalized_email,
            request_id=request_id,
        )

    if user.status != UserStatus.ACTIVE:
        await _reject_inactive(session, user, request_id)

    tenant = await session.get(Tenant, user.tenant_id)
    if tenant is None or tenant.status != TenantStatus.ACTIVE:
        await write_audit_log(
            session,
            actor_type=AuditActorType.USER,
            actor_id=str(user.id),
            tenant_id=user.tenant_id,
            action=AuditAction.LOGIN_FAILED,
            outcome=AuditOutcome.DENIED,
            request_id=request_id,
            metadata={"reason": "tenant_inactive"},
        )
        raise AuthError("Organization access is disabled.")

    return await _complete_login(session, user, request_id=request_id)


async def authenticate_platform_super_admin_user(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    request_id: str | None,
) -> User:
    """Platform Admin API: users with no tenant_id and platform:manage permission."""
    normalized_email = email.lower()
    user = await session.scalar(
        select(User).where(User.email == normalized_email, User.tenant_id.is_(None))
    )

    if user is None or not verify_password(password, user.password_hash):
        await _reject_login_unknown(
            session,
            normalized_email=normalized_email,
            request_id=request_id,
        )

    if user.status != UserStatus.ACTIVE:
        await _reject_inactive(session, user, request_id)

    principal = await load_principal(session, user)
    if PermissionCode.PLATFORM_MANAGE.value not in principal.permission_codes:
        await write_audit_log(
            session,
            actor_type=AuditActorType.USER,
            actor_id=str(user.id),
            tenant_id=None,
            action=AuditAction.LOGIN_FAILED,
            outcome=AuditOutcome.DENIED,
            request_id=request_id,
            metadata={"reason": "not_platform_super_admin"},
        )
        raise AuthError("Invalid email or password.")

    return await _complete_login(session, user, request_id=request_id)


async def authenticate_monolith_user(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    request_id: str | None,
) -> User:
    """Monolith login: prefers a platform console user when the same email matches both worlds."""
    normalized_email = email.lower()
    stmt = (
        select(User)
        .where(User.email == normalized_email)
        .order_by(case((User.tenant_id.is_(None), 0), else_=1))
    )
    user = await session.scalar(stmt)

    if user is None or not verify_password(password, user.password_hash):
        await _reject_login_unknown(
            session,
            normalized_email=normalized_email,
            request_id=request_id,
        )

    if user.status != UserStatus.ACTIVE:
        await _reject_inactive(session, user, request_id)

    if user.tenant_id is not None:
        tenant = await session.get(Tenant, user.tenant_id)
        if tenant is None or tenant.status != TenantStatus.ACTIVE:
            await write_audit_log(
                session,
                actor_type=AuditActorType.USER,
                actor_id=str(user.id),
                tenant_id=user.tenant_id,
                action=AuditAction.LOGIN_FAILED,
                outcome=AuditOutcome.DENIED,
                request_id=request_id,
                metadata={"reason": "tenant_inactive"},
            )
            raise AuthError("Organization access is disabled.")

    if user.tenant_id is None:
        principal = await load_principal(session, user)
        if PermissionCode.PLATFORM_MANAGE.value not in principal.permission_codes:
            await write_audit_log(
                session,
                actor_type=AuditActorType.USER,
                actor_id=str(user.id),
                tenant_id=None,
                action=AuditAction.LOGIN_FAILED,
                outcome=AuditOutcome.DENIED,
                request_id=request_id,
                metadata={"reason": "not_platform_super_admin"},
            )
            raise AuthError("Invalid email or password.")

    return await _complete_login(session, user, request_id=request_id)


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

    if user.tenant_id is not None:
        tenant = await session.get(Tenant, user.tenant_id)
        if tenant is None or tenant.status != TenantStatus.ACTIVE:
            await revoke_refresh_family(redis, refresh_session.family_id)
            raise AuthError("Organization access is disabled.")

    return await issue_token_pair(session, redis, user, family_id=refresh_session.family_id)
