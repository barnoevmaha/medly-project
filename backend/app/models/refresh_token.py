"""Refresh tokens: the long-lived half of a sign-in.

Only a SHA-256 of each token is stored. The token itself is 256 bits from
`secrets`, so a fast hash is enough — there is nothing to brute-force — and a
leaked copy of this table cannot be replayed as a cookie.

Every refresh rotates: the presented token is revoked and a new one issued in
the same `family_id`. A revoked token presented again means two parties hold
the same session, so the whole family is revoked (see app/services/tokens.py).
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models._time import UTCDateTime, utcnow


class RefreshToken(SQLModel, table=True):
    __tablename__ = "refresh_tokens"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    token_hash: str = Field(index=True, unique=True)
    # One sign-in on one device. Rotation keeps the family; logout and reuse
    # detection end it.
    family_id: str = Field(index=True)
    created_at: datetime = Field(default_factory=utcnow, sa_type=UTCDateTime)
    expires_at: datetime = Field(sa_type=UTCDateTime)
    revoked_at: Optional[datetime] = Field(default=None, sa_type=UTCDateTime)
