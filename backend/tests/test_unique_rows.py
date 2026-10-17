"""One like, one membership, one save, one badge — even under parallel requests."""
from __future__ import annotations

import threading
import uuid

from fastapi.testclient import TestClient
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, func, select

from app import db
from app.db import engine
from app.main import app
from app.models.community import CommunityMember
from app.models.course import Enrollment
from app.models.social import Article, ArticleLike, SavedItem
from app.models.user import User

PARALLEL = 8


def _register(client: TestClient) -> tuple[int, dict]:
    email = f"uniq-{uuid.uuid4().hex[:10]}@example.com"
    token = client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123", "full_name": "Unique Test"},
    ).json()["access_token"]
    with Session(engine) as session:
        user_id = session.exec(select(User.id).where(User.email == email)).one()
    return user_id, {"Authorization": f"Bearer {token}"}


def _parallel(method: str, path: str, headers: dict, **kwargs) -> list[int]:
    barrier = threading.Barrier(PARALLEL)
    statuses: list[int] = []

    def worker() -> None:
        own = TestClient(app)
        barrier.wait()
        statuses.append(own.request(method, path, headers=headers, **kwargs).status_code)

    threads = [threading.Thread(target=worker) for _ in range(PARALLEL)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return statuses


def _count(model, *where) -> int:
    with Session(engine) as session:
        statement = select(func.count()).select_from(model)
        for clause in where:
            statement = statement.where(clause)
        return session.exec(statement).one()


def test_parallel_joins_make_one_membership(client: TestClient) -> None:
    user_id, headers = _register(client)
    statuses = _parallel("POST", "/api/communities/cardiology-club/join", headers)
    assert set(statuses) == {200}
    assert _count(CommunityMember, CommunityMember.user_id == user_id) == 1


def test_parallel_saves_make_one_saved_item(client: TestClient) -> None:
    user_id, headers = _register(client)
    with Session(engine) as session:
        slug = session.exec(select(Article.slug).where(Article.published == True)).first()  # noqa: E712
    statuses = _parallel("POST", "/api/saved", headers, json={"item_type": "article", "item_key": slug})
    assert set(statuses) == {201}
    assert _count(SavedItem, SavedItem.user_id == user_id) == 1


def test_parallel_enrolments_make_one_enrolment(client: TestClient) -> None:
    user_id, headers = _register(client)
    statuses = _parallel("POST", "/api/courses/ai-safety-and-ethics/enroll", headers)
    assert set(statuses) == {200}
    assert _count(Enrollment, Enrollment.user_id == user_id) == 1


def test_a_like_is_one_row_per_user(client: TestClient) -> None:
    user_id, headers = _register(client)
    with Session(engine) as session:
        article_id, slug = session.exec(
            select(Article.id, Article.slug).where(Article.published == True)  # noqa: E712
        ).first()
    statuses = _parallel("POST", f"/api/feed/articles/{slug}/like", headers)
    assert set(statuses) == {200}  # a racing duplicate like is not a 500
    assert _count(ArticleLike, ArticleLike.user_id == user_id, ArticleLike.article_id == article_id) <= 1


def test_every_one_per_user_table_gets_its_index_on_an_old_database(tmp_path, monkeypatch) -> None:
    old = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    SQLModel.metadata.create_all(old)
    unique = [
        (table.name, index.name)
        for table in SQLModel.metadata.sorted_tables
        for index in table.indexes
        if index.unique
    ]
    assert len(unique) >= 9
    with old.begin() as connection:
        for _table, name in unique:
            connection.execute(text(f"DROP INDEX {name}"))
        connection.execute(text("INSERT INTO article_likes (id, article_id, user_id, created_at) VALUES "
                                "(1, 5, 9, '2026-01-01 00:00:00'), (2, 5, 9, '2026-01-01 00:00:01')"))
    monkeypatch.setattr(db, "engine", old)

    db._ensure_unique_indexes()

    inspector = sa_inspect(old)
    for table, name in unique:
        assert name in {index["name"] for index in inspector.get_indexes(table)}, name
    with old.connect() as connection:
        assert connection.execute(text("SELECT id FROM article_likes")).scalars().all() == [1]
    old.dispose()
