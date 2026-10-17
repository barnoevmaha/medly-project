"""Who may open what: premium library links, and whose case a teacher may change."""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db import engine
from app.models.casebook import CaseImage, CaseReference
from app.models.enums import Role
from app.models.social import Resource
from app.models.user import User
from app.security import create_access_token, hash_password


PDF = "https://files.example/premium.pdf"


@pytest.fixture
def linked_resources():
    """One premium and one free resource with real links, for the length of a
    test. The seeded ones carry none (the UI shows a placeholder), which would
    make "the link was withheld" indistinguishable from "there was no link"."""
    with Session(engine) as session:
        premium = session.exec(select(Resource).where(Resource.premium == True)).first()  # noqa: E712
        free = session.exec(select(Resource).where(Resource.premium == False)).first()  # noqa: E712
        before = {r.id: (r.url, r.pdf_url, r.video_url) for r in (premium, free)}
        for resource in (premium, free):
            resource.url = resource.pdf_url = resource.video_url = PDF
            session.add(resource)
        session.commit()
        slugs = premium.slug, free.slug
    yield slugs
    with Session(engine) as session:
        for resource_id, (url, pdf_url, video_url) in before.items():
            resource = session.get(Resource, resource_id)
            resource.url, resource.pdf_url, resource.video_url = url, pdf_url, video_url
            session.add(resource)
        session.commit()


def _row(client: TestClient, headers: dict, slug: str) -> dict:
    rows = client.get("/api/resources", headers=headers).json()
    return next(row for row in rows if row["slug"] == slug)


# ------------------------------------------------------------ premium library


def test_premium_links_are_withheld_from_a_free_account(
    client: TestClient, student_headers: dict, linked_resources
) -> None:
    premium, _ = linked_resources
    row = _row(client, student_headers, premium)
    assert row["locked"] is True
    assert row["url"] == row["pdf_url"] == row["video_url"] == ""


def test_free_resources_stay_open_to_everyone(
    client: TestClient, student_headers: dict, linked_resources
) -> None:
    _, free = linked_resources
    row = _row(client, student_headers, free)
    assert row["locked"] is False
    assert row["pdf_url"] == PDF


@pytest.mark.parametrize("who", ["premium_headers", "instructor_headers", "admin_headers"])
def test_premium_and_staff_accounts_get_the_links(
    client: TestClient, request, linked_resources, who: str
) -> None:
    premium, _ = linked_resources
    row = _row(client, request.getfixturevalue(who), premium)
    assert row["locked"] is False
    assert row["url"] == row["pdf_url"] == row["video_url"] == PDF


def test_saving_a_premium_item_does_not_leak_its_link(
    client: TestClient, student_headers: dict, linked_resources
) -> None:
    premium, _ = linked_resources
    kind = _row(client, student_headers, premium)["kind"]
    saved = client.post(
        "/api/saved", json={"item_type": kind, "item_key": premium}, headers=student_headers
    ).json()
    try:
        assert saved["premium"] is True
        assert saved["href"] == ""
    finally:
        client.delete("/api/saved", params={"item_type": kind, "item_key": premium}, headers=student_headers)


# ------------------------------------------------------------ casebook ownership


@pytest.fixture
def other_teacher() -> dict:
    """An instructor who did not author the seeded cases."""
    email = f"teacher-{uuid.uuid4().hex[:8]}@example.com"
    with Session(engine) as session:
        session.add(
            User(email=email, hashed_password=hash_password("password123"),
                 full_name="Other Teacher", role=Role.INSTRUCTOR)
        )
        session.commit()
    return {"Authorization": f"Bearer {create_access_token(email, Role.INSTRUCTOR.value)}"}


@pytest.fixture
def seeded_case() -> tuple[int, int]:
    """A case authored by instructor@medly.dev, and one of its images."""
    with Session(engine) as session:
        case = session.exec(select(CaseReference)).first()
        image = session.exec(select(CaseImage).where(CaseImage.case_id == case.id)).first()
        return case.id, image.id


def test_another_teacher_cannot_change_a_colleagues_case(
    client: TestClient, other_teacher: dict, seeded_case
) -> None:
    case_id, image_id = seeded_case
    attempts = [
        client.post(f"/api/casebook/cases/{case_id}/images", json={"caption": "x"}, headers=other_teacher),
        client.post(f"/api/casebook/images/{image_id}/verify", headers=other_teacher),
        client.post(f"/api/casebook/cases/{case_id}/publish", headers=other_teacher),
        client.post(f"/api/casebook/cases/{case_id}/unpublish", headers=other_teacher),
    ]
    assert [r.status_code for r in attempts] == [403, 403, 403, 403]
    with Session(engine) as session:
        assert session.get(CaseReference, case_id).published is True


def test_another_teacher_can_still_read_it(
    client: TestClient, other_teacher: dict, seeded_case
) -> None:
    case_id, _ = seeded_case
    assert client.get(f"/api/casebook/cases/{case_id}", headers=other_teacher).status_code == 200


@pytest.mark.parametrize("who", ["instructor_headers", "admin_headers"])
def test_the_author_and_an_admin_can(client: TestClient, request, seeded_case, who: str) -> None:
    case_id, _ = seeded_case
    headers = request.getfixturevalue(who)
    assert client.post(f"/api/casebook/cases/{case_id}/unpublish", headers=headers).status_code == 200
    assert client.post(f"/api/casebook/cases/{case_id}/publish", headers=headers).status_code == 200
