"""Timestamps are aware UTC in Python and naive UTC in the database."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlmodel import Session, select

from app.db import engine
from app.models import AuditEvent
from app.models._time import utcnow
from app.models.enums import EventType, RiskLevel


def test_utcnow_is_aware_utc() -> None:
    assert utcnow().tzinfo is timezone.utc


def test_round_trip_is_aware_and_stored_as_naive_utc() -> None:
    # 14:30 at UTC+05:00 is 09:30 UTC.
    at = datetime(2026, 3, 1, 14, 30, tzinfo=timezone(timedelta(hours=5)))
    with Session(engine) as session:
        event = AuditEvent(
            event_type=EventType.ASSISTANT_QUERY, risk_level=RiskLevel.NONE, created_at=at
        )
        session.add(event)
        session.commit()
        event_id = event.id

    with Session(engine) as session:
        stored = session.exec(
            text("SELECT created_at FROM audit_events WHERE id = :id").bindparams(id=event_id)
        ).one()[0]
        assert str(stored).startswith("2026-03-01 09:30:00")

        loaded = session.get(AuditEvent, event_id)
        assert loaded.created_at == at
        assert loaded.created_at.tzinfo is timezone.utc
        # Comparing with an aware "now" must not raise.
        assert loaded.created_at < utcnow()

        newer = session.exec(
            select(AuditEvent).where(AuditEvent.created_at >= at - timedelta(minutes=1))
        ).all()
        assert event_id in {row.id for row in newer}

        session.delete(loaded)
        session.commit()
