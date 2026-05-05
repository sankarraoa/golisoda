import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.channel import FeedbackChannel


def generate_channel_code() -> str:
    # token_urlsafe(8) gives about 64 bits of entropy and usually 11 URL-safe chars.
    return secrets.token_urlsafe(8)


async def generate_unique_channel_code(session: AsyncSession) -> str:
    for _ in range(10):
        channel_code = generate_channel_code()
        exists = await session.scalar(
            select(FeedbackChannel.id).where(FeedbackChannel.channel_code == channel_code)
        )
        if exists is None:
            return channel_code
    raise RuntimeError("Unable to generate a unique channel code.")
