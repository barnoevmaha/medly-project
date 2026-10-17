"""A ceiling on what one user can post: article comments and community messages.

Both are written by students and shown to everyone, and neither costs the
poster anything — so without a limit one account can bury a feed or a room,
or post three comments in a second for the "contributor" badge. Counted per
user, in this process, like the other limits (see app/services/ratelimit.py).
"""
from __future__ import annotations

from fastapi import HTTPException, status

from app.config import settings
from app.services.ratelimit import SlidingWindowLimiter

_limiter = SlidingWindowLimiter(settings.post_rate_limit_per_minute, settings.post_rate_limit_per_hour)


def enforce_post_limit(user_id: int) -> None:
    """Record one post, or refuse it with 429 once the user is over the limit."""
    verdict = _limiter.check(f"post:{user_id}")
    if not verdict.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"You are posting too quickly. Try again in {verdict.retry_after_seconds} seconds.",
            headers={"Retry-After": str(verdict.retry_after_seconds)},
        )


def reset() -> None:
    _limiter.reset()
