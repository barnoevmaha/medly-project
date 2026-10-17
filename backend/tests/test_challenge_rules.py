"""Challenges: deadlines are real, drafts stay drafts, typed answers must be whole."""
from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import seed_content
from app.db import engine
from app.models._time import utcnow
from app.models.challenge import Challenge, ChallengeChoice, ChallengeQuestion
from app.routers.challenges import short_answer_matches


def _register(client: TestClient) -> dict:
    response = client.post(
        "/api/auth/register",
        json={"email": f"ch-{uuid.uuid4().hex[:10]}@example.com", "password": "password123",
              "full_name": "Challenge Test"},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@contextmanager
def _changed(slug: str, **fields):
    """Temporarily change a seeded challenge; the suite shares one database."""
    with Session(engine) as session:
        challenge = session.exec(select(Challenge).where(Challenge.slug == slug)).one()
        before = {name: getattr(challenge, name) for name in fields}
        for name, value in fields.items():
            setattr(challenge, name, value)
        session.add(challenge)
        session.commit()
    try:
        yield
    finally:
        with Session(engine) as session:
            challenge = session.exec(select(Challenge).where(Challenge.slug == slug)).one()
            for name, value in before.items():
                setattr(challenge, name, value)
            session.add(challenge)
            session.commit()


def _correct_answer() -> tuple[str, dict, int]:
    with Session(engine) as session:
        question = session.exec(select(ChallengeQuestion).where(ChallengeQuestion.kind == "mcq")).first()
        challenge = session.get(Challenge, question.challenge_id)
        choice = session.exec(
            select(ChallengeChoice).where(
                ChallengeChoice.question_id == question.id, ChallengeChoice.is_correct == True  # noqa: E712
            )
        ).first()
        return challenge.slug, {"question_id": question.id, "choice_id": choice.id}, question.points


# ------------------------------------------------------------ deadlines


def test_an_ended_challenge_marks_answers_but_pays_nothing(client: TestClient) -> None:
    slug, answer, _ = _correct_answer()
    headers = _register(client)
    with _changed(slug, ends_at=utcnow() - timedelta(hours=1)):
        result = client.post(f"/api/challenges/{slug}/answer", json=answer, headers=headers).json()
    assert result["correct"] is True
    assert result["points_awarded"] == 0
    assert result["challenge_closed"] is True
    assert result["total_points"] == 0


def test_an_open_challenge_still_pays(client: TestClient) -> None:
    slug, answer, worth = _correct_answer()
    headers = _register(client)
    with _changed(slug, ends_at=utcnow() + timedelta(days=1)):
        result = client.post(f"/api/challenges/{slug}/answer", json=answer, headers=headers).json()
    assert result["points_awarded"] == worth
    assert result["challenge_closed"] is False


def test_the_seed_reopens_an_ended_demo_challenge() -> None:
    """Seeded challenges are the demo's recurring set; with deadlines enforced,
    they would otherwise stop paying a few days after the first deploy."""
    slug = seed_content.CHALLENGES[0]["slug"]
    with _changed(slug, ends_at=utcnow() - timedelta(days=30)):
        with Session(engine) as session:
            seed_content._seed_challenges(session)
            reopened = session.exec(select(Challenge).where(Challenge.slug == slug)).one()
            assert reopened.ends_at > utcnow()


# ------------------------------------------------------------ drafts


@pytest.mark.parametrize("action", ["get", "join", "answer"])
def test_an_unpublished_challenge_is_not_reachable_by_link(
    client: TestClient, student_headers: dict, action: str
) -> None:
    slug, answer, _ = _correct_answer()
    with _changed(slug, published=False):
        if action == "get":
            response = client.get(f"/api/challenges/{slug}", headers=student_headers)
        elif action == "join":
            response = client.post(f"/api/challenges/{slug}/join", headers=student_headers)
        else:
            response = client.post(f"/api/challenges/{slug}/answer", json=answer, headers=student_headers)
    assert response.status_code == 404


# ------------------------------------------------------------ typed answers


@pytest.mark.parametrize(
    "given, expected",
    [
        ("pneumonia", "pneumonia"),
        ("Pneumonia.", "pneumonia"),
        ("community acquired pneumonia", "community-acquired pneumonia"),
        ("acute kidney injury", "Acute Kidney Injury"),
        ("an acute kidney injury", "acute kidney injury"),
    ],
)
def test_whole_answers_are_accepted(given: str, expected: str) -> None:
    assert short_answer_matches(given, expected)


@pytest.mark.parametrize(
    "given, expected",
    [
        ("pneu", "pneumonia"),
        ("acute", "acute kidney injury"),
        ("kidney", "acute kidney injury"),
        ("tion", "community-acquired pneumonia"),
        ("", "pneumonia"),
        ("anything", ""),
    ],
)
def test_fragments_are_not(given: str, expected: str) -> None:
    assert not short_answer_matches(given, expected)
