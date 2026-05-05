from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_principal
from app.auth.principal import Principal
from app.auth.refresh_tokens import consume_refresh_token, revoke_refresh_family
from app.auth.schemas import LoginRequest, LogoutRequest, MeResponse, RefreshRequest, TokenResponse
from app.core.database import get_session
from app.core.redis import get_redis
from app.models.enums import AuditAction, AuditActorType, AuditOutcome
from app.services.audit import write_audit_log
from app.services.auth import AuthError, authenticate_user, issue_token_pair, refresh_token_pair

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> TokenResponse:
    try:
        user = await authenticate_user(
            session,
            email=str(payload.email),
            password=payload.password,
            request_id=getattr(request.state, "request_id", None),
        )
        access_token, refresh_token, expires_in, _ = await issue_token_pair(session, redis, user)
        await session.commit()
    except AuthError as exc:
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    payload: RefreshRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> TokenResponse:
    try:
        access_token, refresh_token, expires_in, _ = await refresh_token_pair(
            session,
            redis,
            refresh_token=payload.refresh_token,
            request_id=getattr(request.state, "request_id", None),
        )
        await session.commit()
    except AuthError as exc:
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    payload: LogoutRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> None:
    try:
        refresh_session = await consume_refresh_token(redis, payload.refresh_token)
        await revoke_refresh_family(redis, refresh_session.family_id)
        await write_audit_log(
            session,
            actor_type=AuditActorType.USER,
            actor_id=str(refresh_session.user_id),
            tenant_id=refresh_session.tenant_id,
            action=AuditAction.LOGOUT,
            outcome=AuditOutcome.SUCCESS,
            request_id=getattr(request.state, "request_id", None),
        )
        await session.commit()
    except Exception as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token.",
        ) from exc


@router.get("/me", response_model=MeResponse)
async def me(
    principal: Annotated[Principal, Depends(get_current_principal)],
) -> MeResponse:
    return MeResponse(
        user_id=principal.user_id,
        email=principal.email,
        tenant_id=principal.tenant_id,
        role_codes=principal.role_codes,
        permission_codes=principal.permission_codes,
        location_ids=principal.location_ids,
        token_version=principal.token_version,
    )
