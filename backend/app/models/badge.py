"""Badges earned from real activity.

Badge definitions live in services/badges.py; this table only records what a
given user has actually earned, and when.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Index
from sqlmodel import Field, SQLModel

from app.models._time import UTCDateTime, utcnow


class UserBadge(SQLModel, table=True):
    __tablename__ = "user_badges"
    # One row per pair, as a database rule (see app/db.py `_ensure_unique_indexes`).
    __table_args__ = (Index("ux_user_badges_user_badge", "user_id", "badge_key", unique=True),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    badge_key: str = Field(index=True)
    earned_at: datetime = Field(default_factory=utcnow, sa_type=UTCDateTime)
