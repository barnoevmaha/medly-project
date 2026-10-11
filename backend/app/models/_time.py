"""UTC time for the models.

Every timestamp in Medly is UTC. `datetime.utcnow()` is deprecated and returns
a *naive* value; `datetime.now(timezone.utc)` returns an *aware* one. Python
refuses to compare or subtract the two, so the codebase must use one kind
throughout — aware, via `utcnow()` below.

The columns stay plain `DateTime` (no time zone) so existing SQLite and Postgres
databases need no migration. `UTCDateTime` is the adapter: it writes naive UTC,
exactly what was stored before, and hands every value back aware. Without it a
row read from the database would be naive while a value created in the same
request is aware, and sorting the two together raises `TypeError`.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


def utcnow() -> datetime:
    """The current time, timezone-aware, in UTC."""
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """A `DateTime` column that stores naive UTC and returns aware UTC."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: Optional[datetime], dialect: Any) -> Optional[datetime]:
        if value is None:
            return None
        if value.tzinfo is None:
            # Naive values have always meant UTC here.
            return value
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: Optional[datetime], dialect: Any) -> Optional[datetime]:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
