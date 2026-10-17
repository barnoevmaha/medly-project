"""Points are paid exactly once, including when requests arrive together.

The concurrency tests fire real parallel requests: a check-then-write that is
only correct one request at a time is exactly what they exist to catch.
"""
from __future__ import annotations

import threading
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, create_engine, select

from app import db
from app.db import engine
from app.main import app
from app.models.challenge import Challenge, ChallengeAnswer, ChallengeChoice, ChallengeQuestion
from app.models.quiz import Choice, Question, Quiz, QuizReward
from app.models.user import User
from app.services import gamification

PARALLEL = 8


def _register(client: TestClient) -> tuple[str, dict]:
    email = f"pts-{uuid.uuid4().hex[:10]}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123", "full_name": "Points Test"},
    )
    return email, {"Authorization": f"Bearer {response.json()['access_token']}"}


def _points(email: str) -> int:
    with Session(engine) as session:
        return session.exec(select(User.points).where(User.email == email)).one()


def _in_parallel(request) -> list:
    """Run `request(client)` PARALLEL times at once, each on its own client."""
    barrier = threading.Barrier(PARALLEL)
    results: list = []

    def worker() -> None:
        own = TestClient(app)
        barrier.wait()
        results.append(request(own))

    threads = [threading.Thread(target=worker) for _ in range(PARALLEL)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return results


# ------------------------------------------------------------ quizzes


def _perfect_answers() -> tuple[int, dict]:
    with Session(engine) as session:
        quiz = session.exec(select(Quiz)).first()
        answers = {
            str(question.id): [
                choice.id
                for choice in session.exec(
                    select(Choice).where(Choice.question_id == question.id, Choice.is_correct == True)  # noqa: E712
                )
            ]
            for question in session.exec(select(Question).where(Question.quiz_id == quiz.id))
        }
        return quiz.id, answers


def test_passing_a_quiz_pays_once(client: TestClient) -> None:
    email, headers = _register(client)
    quiz_id, answers = _perfect_answers()

    first = client.post(f"/api/quizzes/{quiz_id}/submit", json={"answers": answers}, headers=headers).json()
    assert first["passed"] is True
    assert first["points_awarded"] == 100
    assert first["total_points"] == 100

    again = client.post(f"/api/quizzes/{quiz_id}/submit", json={"answers": answers}, headers=headers).json()
    assert again["points_awarded"] == 0
    assert _points(email) == 100


def test_failing_a_quiz_pays_nothing_and_claims_nothing(client: TestClient) -> None:
    email, headers = _register(client)
    quiz_id, _ = _perfect_answers()

    failed = client.post(f"/api/quizzes/{quiz_id}/submit", json={"answers": {}}, headers=headers).json()
    assert failed["passed"] is False
    assert failed["points_awarded"] == 0
    with Session(engine) as session:
        user_id = session.exec(select(User.id).where(User.email == email)).one()
        assert not session.exec(select(QuizReward).where(QuizReward.user_id == user_id)).first()


def test_parallel_passing_submissions_pay_once(client: TestClient) -> None:
    email, headers = _register(client)
    quiz_id, answers = _perfect_answers()

    results = _in_parallel(
        lambda own: own.post(
            f"/api/quizzes/{quiz_id}/submit", json={"answers": answers}, headers=headers
        ).json()["points_awarded"]
    )
    assert sorted(results) == [0] * (PARALLEL - 1) + [100]
    assert _points(email) == 100


# ------------------------------------------------------------ challenges


def _correct_mcq() -> tuple[str, int, int, int]:
    with Session(engine) as session:
        question = session.exec(select(ChallengeQuestion).where(ChallengeQuestion.kind == "mcq")).first()
        challenge = session.get(Challenge, question.challenge_id)
        choice = session.exec(
            select(ChallengeChoice).where(
                ChallengeChoice.question_id == question.id, ChallengeChoice.is_correct == True  # noqa: E712
            )
        ).first()
        return challenge.slug, question.id, choice.id, question.points


def test_parallel_answers_to_one_question_pay_once(client: TestClient) -> None:
    email, headers = _register(client)
    slug, question_id, choice_id, worth = _correct_mcq()

    results = _in_parallel(
        lambda own: own.post(
            f"/api/challenges/{slug}/answer",
            json={"question_id": question_id, "choice_id": choice_id},
            headers=headers,
        ).json()
    )
    assert sorted(r["points_awarded"] for r in results) == [0] * (PARALLEL - 1) + [worth]
    assert all(r["correct"] for r in results)
    assert sum(r["already_answered"] for r in results) == PARALLEL - 1
    assert _points(email) == worth
    with Session(engine) as session:
        user_id = session.exec(select(User.id).where(User.email == email)).one()
        rows = session.exec(
            select(ChallengeAnswer).where(
                ChallengeAnswer.user_id == user_id, ChallengeAnswer.question_id == question_id
            )
        ).all()
    assert len(rows) == 1


def test_parallel_awards_are_all_counted(client: TestClient) -> None:
    """Read-add-write would lose some of these; one UPDATE per award cannot."""
    email, _ = _register(client)
    with Session(engine) as session:
        user_id = session.exec(select(User.id).where(User.email == email)).one()

    def award(_client) -> None:
        with Session(engine) as session:
            gamification.award_points(session, session.get(User, user_id), 10)

    _in_parallel(award)
    assert _points(email) == PARALLEL * 10


# ------------------------------------------------------------ migration


def test_existing_databases_get_the_unique_index_and_lose_duplicates(
    tmp_path, monkeypatch
) -> None:
    """A database created before the index existed — with the duplicate rows
    the race used to write — is repaired on boot, keeping the first answer."""
    old = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    SQLModel.metadata.create_all(old)
    with old.begin() as connection:
        connection.execute(text("DROP INDEX ux_challenge_answers_user_question"))
        for answer_id, user_id, question_id in [(1, 7, 3), (2, 7, 3), (3, 7, 3), (4, 7, 4), (5, 8, 3)]:
            connection.execute(
                text(
                    "INSERT INTO challenge_answers (id, user_id, challenge_id, question_id, "
                    "answer_text, correct, points_awarded, answered_at) "
                    "VALUES (:id, :user, 1, :question, '', 1, 100, '2026-01-01 00:00:00')"
                ),
                {"id": answer_id, "user": user_id, "question": question_id},
            )
    monkeypatch.setattr(db, "engine", old)

    db._ensure_unique_indexes()

    names = {index["name"] for index in sa_inspect(old).get_indexes("challenge_answers")}
    assert "ux_challenge_answers_user_question" in names
    with old.connect() as connection:
        kept = connection.execute(text("SELECT id FROM challenge_answers ORDER BY id")).scalars().all()
    assert kept == [1, 4, 5]
    # And it holds from now on.
    with Session(old) as session, pytest.raises(IntegrityError):
        session.add(
            ChallengeAnswer(user_id=7, challenge_id=1, question_id=3, correct=True, points_awarded=100)
        )
        session.commit()
    old.dispose()
