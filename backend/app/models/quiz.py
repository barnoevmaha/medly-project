"""Assessment: quizzes, questions, choices and attempts."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel

from app.models._time import UTCDateTime, utcnow


class Quiz(SQLModel, table=True):
    __tablename__ = "quizzes"

    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="courses.id", index=True)
    title: str
    description: str = Field(default="")
    passing_score: int = Field(default=80)

    # Filled on first view in that language by localize.ensure_fields.
    title_ru: str = Field(default="")
    title_uz: str = Field(default="")
    description_ru: str = Field(default="")
    description_uz: str = Field(default="")


class Question(SQLModel, table=True):
    __tablename__ = "questions"

    id: Optional[int] = Field(default=None, primary_key=True)
    quiz_id: int = Field(foreign_key="quizzes.id", index=True)
    order: int = Field(default=0)
    prompt: str
    # "single" = one correct choice, "multi" = several.
    kind: str = Field(default="single")
    explanation: str = Field(default="")
    points: int = Field(default=1)

    prompt_ru: str = Field(default="")
    prompt_uz: str = Field(default="")
    explanation_ru: str = Field(default="")
    explanation_uz: str = Field(default="")


class Choice(SQLModel, table=True):
    __tablename__ = "choices"

    id: Optional[int] = Field(default=None, primary_key=True)
    question_id: int = Field(foreign_key="questions.id", index=True)
    order: int = Field(default=0)
    text: str
    is_correct: bool = Field(default=False)

    text_ru: str = Field(default="")
    text_uz: str = Field(default="")


class QuizAttempt(SQLModel, table=True):
    __tablename__ = "quiz_attempts"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    quiz_id: int = Field(foreign_key="quizzes.id", index=True)
    score: int = Field(default=0)
    passed: bool = Field(default=False)
    # JSON: {"question_id": [choice_id, ...]}
    answers_json: str = Field(default="{}")
    submitted_at: datetime = Field(default_factory=utcnow, sa_type=UTCDateTime)


class QuizReward(SQLModel, table=True):
    """The points for passing a quiz — one row per (user, quiz), ever.

    The unique pair is what makes "once" hold. Checking for an earlier passed
    attempt and then paying is two steps, and two submissions arriving
    together would both see "not yet" and both pay. Inserting this row is the
    claim: exactly one insert can succeed.
    """

    __tablename__ = "quiz_rewards"
    __table_args__ = (UniqueConstraint("user_id", "quiz_id", name="uq_quiz_rewards_user_quiz"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    quiz_id: int = Field(foreign_key="quizzes.id", index=True)
    points: int = Field(default=0)
    awarded_at: datetime = Field(default_factory=utcnow, sa_type=UTCDateTime)
