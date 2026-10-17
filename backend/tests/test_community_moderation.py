"""Posting limits, message paging, and who may delete a message."""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db import engine
from app.models.community import Community, CommunityMessage
from app.models.social import Article
from app.services import posting

ROOM = "cardiology-club"


def _register(client: TestClient) -> dict:
    response = client.post(
        "/api/auth/register",
        json={"email": f"mod-{uuid.uuid4().hex[:10]}@example.com", "password": "password123",
              "full_name": "Moderation Test"},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _post(client: TestClient, headers: dict, body: str = "Hello, room"):
    return client.post(f"/api/communities/{ROOM}/messages", json={"body": body}, headers=headers)


# ------------------------------------------------------------ posting limits


def test_messages_are_rate_limited_per_user(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(posting._limiter, "per_minute", 3)
    spammer, bystander = _register(client), _register(client)
    statuses = [_post(client, spammer).status_code for _ in range(4)]
    assert statuses == [201, 201, 201, 429]
    assert int(_post(client, spammer).headers["Retry-After"]) >= 1
    assert _post(client, bystander).status_code == 201


def test_comments_share_the_same_limit(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(posting._limiter, "per_minute", 2)
    with Session(engine) as session:
        slug = session.exec(select(Article.slug).where(Article.published == True)).first()  # noqa: E712
    headers = _register(client)
    assert _post(client, headers).status_code == 201
    comment = lambda: client.post(  # noqa: E731
        f"/api/feed/articles/{slug}/comments", json={"body": "Nice"}, headers=headers
    )
    assert comment().status_code == 201
    assert comment().status_code == 429


# ------------------------------------------------------------ paging


def test_a_room_returns_its_newest_messages_not_its_whole_history(client: TestClient) -> None:
    headers = _register(client)
    for i in range(5):
        posting.reset()
        assert _post(client, headers, f"page-test {i}").status_code == 201

    newest = client.get(f"/api/communities/{ROOM}/messages", params={"limit": 3}, headers=headers).json()
    assert [m["body"] for m in newest] == ["page-test 2", "page-test 3", "page-test 4"]

    older = client.get(
        f"/api/communities/{ROOM}/messages",
        params={"limit": 2, "before_id": newest[0]["id"]},
        headers=headers,
    ).json()
    assert [m["body"] for m in older] == ["page-test 0", "page-test 1"]


def test_the_page_size_is_capped(client: TestClient, student_headers: dict) -> None:
    response = client.get(f"/api/communities/{ROOM}/messages", params={"limit": 5000}, headers=student_headers)
    assert response.status_code == 422


# ------------------------------------------------------------ deleting


def test_you_can_delete_your_own_message(client: TestClient) -> None:
    headers = _register(client)
    message = _post(client, headers, "delete me").json()
    assert client.delete(f"/api/communities/messages/{message['id']}", headers=headers).status_code == 204
    with Session(engine) as session:
        assert session.get(CommunityMessage, message["id"]) is None


def test_you_cannot_delete_someone_elses(client: TestClient) -> None:
    author, other = _register(client), _register(client)
    message = _post(client, author, "not yours").json()
    assert client.delete(f"/api/communities/messages/{message['id']}", headers=other).status_code == 403


@pytest.mark.parametrize("who", ["instructor_headers", "admin_headers"])
def test_moderators_can_delete_any_message(client: TestClient, request, who: str) -> None:
    message = _post(client, _register(client), "spam").json()
    headers = request.getfixturevalue(who)
    assert client.delete(f"/api/communities/messages/{message['id']}", headers=headers).status_code == 204


def test_seeded_messages_are_moderator_only(client: TestClient, student_headers: dict) -> None:
    with Session(engine) as session:
        community = session.exec(select(Community).where(Community.slug == ROOM)).one()
        seeded = session.exec(
            select(CommunityMessage).where(
                CommunityMessage.community_id == community.id, CommunityMessage.user_id == None  # noqa: E711
            )
        ).first()
    assert client.delete(f"/api/communities/messages/{seeded.id}", headers=student_headers).status_code == 403
