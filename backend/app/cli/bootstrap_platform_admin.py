"""Create the first platform super admin (tenant_id NULL + platform_super_admin role)."""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select

from app.api.tenants import ensure_permissions_and_default_roles
from app.auth.passwords import hash_password
from app.core.database import get_session_factory
from app.models.auth import Role, User, UserRoleBinding
from app.models.enums import BindingScope, UserStatus


async def _run(*, email: str, display_name: str, password: str) -> None:
    normalized_email = email.lower()
    async with get_session_factory()() as session:
        await ensure_permissions_and_default_roles(session)
        existing = await session.scalar(
            select(User).where(User.email == normalized_email, User.tenant_id.is_(None))
        )
        if existing is not None:
            raise SystemExit(f"Platform user already exists: {normalized_email}")

        role = await session.scalar(
            select(Role).where(Role.code == "platform_super_admin", Role.tenant_id.is_(None))
        )
        if role is None:
            raise SystemExit("platform_super_admin role missing; run app against a migrated database.")

        user = User(
            tenant_id=None,
            email=normalized_email,
            display_name=display_name,
            password_hash=hash_password(password),
            status=UserStatus.ACTIVE,
            token_version=1,
        )
        session.add(user)
        await session.flush()
        session.add(
            UserRoleBinding(
                user_id=user.id,
                role_id=role.id,
                scope=BindingScope.GLOBAL,
                tenant_id=None,
                location_id=None,
            )
        )
        await session.commit()
    print(f"Created platform super admin {normalized_email}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--display-name", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()
    asyncio.run(_run(email=args.email, display_name=args.display_name, password=args.password))


if __name__ == "__main__":
    main()
