"""Refresh-token lifecycle: issue, rotate, revoke.

The raw token only ever exists in two places: the httpOnly cookie, and the
response that sets it. The database holds its SHA-256 (see
app/models/refresh_token.py for why a fast hash is the right one here).
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import timedelta
from typing import Optional, Tuple

from sqlalchemy import delete, update
from sqlmodel import Session, select

from app.config import settings
from app.models._time import utcnow
from app.models.refresh_token import RefreshToken
from app.models.user import User


class RefreshError(Exception):
    """The presented refresh token cannot be exchanged. Always a 401."""


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def issue(session: Session, user_id: int, family_id: Optional[str] = None) -> str:
    """Store a new refresh token for `user_id` and return the raw value.

    Also clears that user's expired rows, so the table does not grow forever.
    """
    now = utcnow()
    session.exec(  # type: ignore[call-overload]
        delete(RefreshToken).where(
            RefreshToken.user_id == user_id, RefreshToken.expires_at < now  # type: ignore[arg-type]
        )
    )
    raw = secrets.token_urlsafe(32)
    session.add(
        RefreshToken(
            user_id=user_id,
            token_hash=_hash(raw),
            family_id=family_id or uuid.uuid4().hex,
            expires_at=now + timedelta(days=settings.refresh_token_days),
        )
    )
    session.commit()
    return raw


def rotate(session: Session, raw: str) -> Tuple[User, str]:
    """Exchange a refresh token for a new one. Returns the user and the new token.

    A token that was already rotated or revoked is evidence that someone else
    has a copy — the legitimate client and a thief cannot both be holding the
    current one. The whole family is revoked, which signs both out.
    """
    row = session.exec(select(RefreshToken).where(RefreshToken.token_hash == _hash(raw))).first()
    if row is None:
        raise RefreshError("unknown token")
    if row.revoked_at is not None:
        revoke_family(session, row.family_id)
        raise RefreshError("token reuse")
    now = utcnow()
    if row.expires_at <= now:
        raise RefreshError("expired")
    user = session.get(User, row.user_id)
    if user is None or not user.is_active:
        raise RefreshError("no such user")

    # Conditional on still being unrevoked, so two requests racing with the
    # same token cannot both win: exactly one sees a row updated.
    result = session.exec(  # type: ignore[call-overload]
        update(RefreshToken)
        .where(RefreshToken.id == row.id, RefreshToken.revoked_at.is_(None))  # type: ignore[union-attr]
        .values(revoked_at=now)
    )
    if result.rowcount != 1:
        session.rollback()
        revoke_family(session, row.family_id)
        raise RefreshError("token reuse")

    return user, issue(session, user.id or 0, row.family_id)


def revoke_family(session: Session, family_id: str) -> None:
    _revoke(session, RefreshToken.family_id == family_id)


def revoke_all_for_user(session: Session, user_id: int) -> None:
    """Sign every device out. Used when the password changes."""
    _revoke(session, RefreshToken.user_id == user_id)


def revoke(session: Session, raw: str) -> None:
    """End the sign-in that `raw` belongs to. Unknown tokens are ignored."""
    row = session.exec(select(RefreshToken).where(RefreshToken.token_hash == _hash(raw))).first()
    if row is not None:
        revoke_family(session, row.family_id)


def _revoke(session: Session, condition) -> None:
    session.exec(  # type: ignore[call-overload]
        update(RefreshToken)
        .where(condition, RefreshToken.revoked_at.is_(None))  # type: ignore[union-attr]
        .values(revoked_at=utcnow())
    )
    session.commit()
