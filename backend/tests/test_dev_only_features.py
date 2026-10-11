"""What exists only in development: demo accounts and the demo checkout.
And what no longer exists at all: the unwired teacher router.
"""
from __future__ import annotations

import importlib
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, func, select

from app import db, seed
from app.main import app
from app.models.social import Article
from app.models.user import User

BACKEND = Path(__file__).resolve().parent.parent


# ------------------------------------------------------------ 5. demo users


@pytest.fixture
def empty_database(tmp_path, monkeypatch):
    """Point the seed at a brand-new SQLite file instead of the suite's database."""
    engine = create_engine(f"sqlite:///{tmp_path / 'seed.db'}")
    monkeypatch.setattr(db, "engine", engine)
    monkeypatch.setattr(seed, "engine", engine)
    yield engine
    SQLModel.metadata.drop_all(engine)
    engine.dispose()


def _accounts(engine) -> list[str]:
    with Session(engine) as session:
        return sorted(session.exec(select(User.email)).all())


def test_seed_creates_no_accounts_unless_asked(empty_database, override_settings) -> None:
    override_settings(seed_demo_users=False)
    seed.run()
    assert _accounts(empty_database) == []
    # The content itself is still seeded — only the people are left out.
    with Session(empty_database) as session:
        assert session.exec(select(func.count()).select_from(Article)).one() > 0


def test_seed_creates_demo_accounts_when_allowed(empty_database, override_settings) -> None:
    override_settings(seed_demo_users=True)
    seed.run()
    accounts = _accounts(empty_database)
    assert "student@medly.dev" in accounts
    assert "admin@medly.dev" in accounts
    assert "sarah.chen@medly.dev" in accounts  # the seeded peers share the password


def _seed_demo_users(**env: str) -> str:
    run_env = {k: v for k, v in os.environ.items() if not k.startswith("MEDLY_")}
    run_env.update(env)
    return subprocess.run(
        [sys.executable, "-c", "from app.config import settings; print(settings.seed_demo_users)"],
        cwd=BACKEND,
        env=run_env,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


def test_demo_users_follow_medly_env_and_the_opt_in_flag() -> None:
    assert _seed_demo_users(MEDLY_ENV="dev") == "True"
    assert _seed_demo_users(MEDLY_ENV="production") == "False"
    assert _seed_demo_users(MEDLY_ENV="production", MEDLY_SEED_DEMO_USERS="true") == "True"
    assert _seed_demo_users(MEDLY_ENV="production", MEDLY_SEED_DEMO_USERS="false") == "False"


# ------------------------------------------------------------ 7. premium


def _premium(client: TestClient, headers: dict) -> bool:
    return client.get("/api/profile", headers=headers).json()["is_premium"]


def test_demo_checkout_works_in_dev(client: TestClient, student_headers: dict) -> None:
    response = client.post("/api/profile/premium", headers=student_headers)
    assert response.status_code == 200
    assert response.json()["is_premium"] is True
    client.delete("/api/profile/premium", headers=student_headers)


def test_demo_checkout_is_closed_outside_dev(
    client: TestClient, student_headers: dict, override_settings
) -> None:
    override_settings(env="production")
    assert _premium(client, student_headers) is False
    response = client.post("/api/profile/premium", headers=student_headers)
    assert response.status_code == 403
    assert _premium(client, student_headers) is False


def test_cancelling_premium_stays_open_outside_dev(
    client: TestClient, premium_headers: dict, override_settings
) -> None:
    override_settings(env="production")
    assert client.delete("/api/profile/premium", headers=premium_headers).status_code == 200
    assert _premium(client, premium_headers) is False
    # Put the demo account back for the tests that rely on it.
    with Session(db.engine) as session:
        user = session.exec(select(User).where(User.email == "premium@medly.dev")).one()
        user.is_premium = True
        session.add(user)
        session.commit()


def test_premium_needs_a_signed_in_user(client: TestClient) -> None:
    assert client.post("/api/profile/premium").status_code == 401


# ------------------------------------------------------------ 8. teacher router


def test_teacher_router_is_gone() -> None:
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("app.routers.teacher")
    assert not [r for r in app.routes if getattr(r, "path", "").startswith("/api/teacher")]


def test_teacher_endpoints_are_not_served(client: TestClient, instructor_headers: dict) -> None:
    for path in ("/api/teacher/summary", "/api/teacher/students", "/api/teacher/content"):
        assert client.get(path, headers=instructor_headers).status_code == 404
