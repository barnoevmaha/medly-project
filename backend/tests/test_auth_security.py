"""Login hardening: brute-force limits, one spelling per email, refresh tokens.

Tests that depend on cookies build their own `TestClient`, because the shared
session-scoped one keeps a cookie jar across tests.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import timedelta
from http.cookies import SimpleCookie

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.config import settings
from app.db import engine
from app.main import app
from app.models._time import utcnow
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.routers import auth
from app.security import hash_password
from app.seed import DEMO_PASSWORD

CSRF = {"X-Medly-CSRF": "1"}
PASSWORD = "correct-horse-battery"


def _email() -> str:
    return f"user-{uuid.uuid4().hex[:10]}@example.com"


def _register(client: TestClient, email: str, password: str = PASSWORD):
    return client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "full_name": "Test User"},
    )


def _login(client: TestClient, email: str, password: str = PASSWORD):
    return client.post("/api/auth/login", data={"username": email, "password": password})


def _bearer(response) -> dict:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _set_cookie(response) -> SimpleCookie:
    cookie = SimpleCookie()
    for header in response.headers.get_list("set-cookie"):
        cookie.load(header)
    return cookie


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


@pytest.fixture
def fresh() -> TestClient:
    return TestClient(app)


# ------------------------------------------------------------ 2. rate limits


def test_login_is_limited_per_email(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(auth._email_limiter, "per_minute", 3)
    email = _email()
    for _ in range(3):
        assert _login(client, email, "wrong-password").status_code == 401
    blocked = _login(client, email, "wrong-password")
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1
    # A different account from the same client is still allowed.
    assert _login(client, _email(), "wrong-password").status_code == 401


def test_email_limit_ignores_case(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(auth._email_limiter, "per_minute", 2)
    email = _email()
    _login(client, email.upper(), "x")
    _login(client, email, "x")
    assert _login(client, email.title(), "x").status_code == 429


def test_login_is_limited_per_ip(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(auth._ip_limiter, "per_minute", 3)
    for _ in range(3):
        assert _login(client, _email(), "wrong-password").status_code == 401
    assert _login(client, _email(), "wrong-password").status_code == 429


def test_blocked_login_is_refused_even_with_the_right_password(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(auth._email_limiter, "per_minute", 2)
    _login(client, "student@medly.dev", "guess-1")
    _login(client, "student@medly.dev", "guess-2")
    assert _login(client, "student@medly.dev", DEMO_PASSWORD).status_code == 429


def test_register_is_limited(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(auth._ip_limiter, "per_minute", 2)
    assert _register(client, _email()).status_code == 201
    assert _register(client, _email()).status_code == 201
    assert _register(client, _email()).status_code == 429


def test_limits_are_per_client_ip(monkeypatch) -> None:
    monkeypatch.setattr(auth._ip_limiter, "per_minute", 1)
    first = TestClient(app, client=("203.0.113.1", 50000))
    second = TestClient(app, client=("203.0.113.2", 50000))
    assert _login(first, _email(), "x").status_code == 401
    assert _login(first, _email(), "x").status_code == 429
    assert _login(second, _email(), "x").status_code == 401


# ------------------------------------------------------------ 3. email case


def test_register_stores_the_email_lowercased(client: TestClient) -> None:
    email = _email()
    assert _register(client, "  " + email.upper() + " ").status_code == 201
    with Session(engine) as session:
        assert session.exec(select(User).where(User.email == email)).one()


def test_same_address_in_another_case_is_a_duplicate(client: TestClient) -> None:
    email = _email()
    assert _register(client, email).status_code == 201
    assert _register(client, email.upper()).status_code == 400


def test_login_ignores_case(client: TestClient) -> None:
    response = _login(client, "Student@Medly.DEV", DEMO_PASSWORD)
    assert response.status_code == 200
    me = client.get("/api/auth/me", headers=_bearer(response))
    assert me.json()["email"] == "student@medly.dev"


def test_rows_stored_before_normalisation_still_sign_in(client: TestClient) -> None:
    mixed = f"Legacy.{uuid.uuid4().hex[:8]}@Example.COM"
    with Session(engine) as session:
        session.add(User(email=mixed, hashed_password=hash_password(PASSWORD), full_name="Legacy"))
        session.commit()
    response = _login(client, mixed.lower(), PASSWORD)
    assert response.status_code == 200
    assert client.get("/api/auth/me", headers=_bearer(response)).status_code == 200


def test_current_user_lookup_ignores_case(client: TestClient) -> None:
    token = jwt.encode(
        {"sub": "STUDENT@medly.dev", "role": "student", "exp": utcnow() + timedelta(minutes=5)},
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["email"] == "student@medly.dev"


# ------------------------------------------------------------ 4. tokens


def test_access_token_lives_fifteen_minutes(client: TestClient) -> None:
    token = _login(client, "student@medly.dev", DEMO_PASSWORD).json()["access_token"]
    claims = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    assert claims["exp"] - claims["iat"] == 15 * 60


def test_login_sets_an_httponly_refresh_cookie_stored_hashed(fresh: TestClient) -> None:
    response = _login(fresh, "student@medly.dev", DEMO_PASSWORD)
    morsel = _set_cookie(response)[auth.REFRESH_COOKIE]
    assert morsel["httponly"]
    assert morsel["path"] == "/api/auth"
    assert morsel["samesite"].lower() == "lax"  # dev
    assert int(morsel["max-age"]) == settings.refresh_token_days * 86400
    # Never in the body, where script could read it.
    assert morsel.value not in response.text

    with Session(engine) as session:
        assert not session.exec(
            select(RefreshToken).where(RefreshToken.token_hash == morsel.value)
        ).first()
        row = session.exec(
            select(RefreshToken).where(RefreshToken.token_hash == _hash(morsel.value))
        ).one()
        assert row.revoked_at is None


def test_register_also_starts_a_session(fresh: TestClient) -> None:
    response = _register(fresh, _email())
    assert auth.REFRESH_COOKIE in _set_cookie(response)
    assert fresh.post("/api/auth/refresh", headers=CSRF).status_code == 200


def test_production_cookie_is_secure_and_cross_site(fresh: TestClient, override_settings) -> None:
    override_settings(refresh_cookie_secure=True, refresh_cookie_samesite="none")
    morsel = _set_cookie(_login(fresh, "student@medly.dev", DEMO_PASSWORD))[auth.REFRESH_COOKIE]
    assert morsel["secure"]
    assert morsel["samesite"].lower() == "none"


def test_refresh_rotates_the_cookie(fresh: TestClient) -> None:
    _login(fresh, "student@medly.dev", DEMO_PASSWORD)
    old = fresh.cookies[auth.REFRESH_COOKIE]

    response = fresh.post("/api/auth/refresh", headers=CSRF)
    assert response.status_code == 200
    new = fresh.cookies[auth.REFRESH_COOKIE]
    assert new != old
    assert fresh.get("/api/auth/me", headers=_bearer(response)).status_code == 200

    with Session(engine) as session:
        rows = {
            row.token_hash: row
            for row in session.exec(
                select(RefreshToken).where(RefreshToken.token_hash.in_([_hash(old), _hash(new)]))  # type: ignore[attr-defined]
            )
        }
        assert rows[_hash(old)].revoked_at is not None
        assert rows[_hash(new)].revoked_at is None
        assert rows[_hash(old)].family_id == rows[_hash(new)].family_id


def test_refresh_requires_the_csrf_header(fresh: TestClient) -> None:
    _login(fresh, "student@medly.dev", DEMO_PASSWORD)
    assert fresh.post("/api/auth/refresh").status_code == 403


def test_refresh_without_a_cookie_is_401(fresh: TestClient) -> None:
    assert fresh.post("/api/auth/refresh", headers=CSRF).status_code == 401


def test_reusing_a_rotated_token_revokes_the_whole_session(fresh: TestClient) -> None:
    """Whoever presents the old token second — thief or owner — ends it for both."""
    _login(fresh, "student@medly.dev", DEMO_PASSWORD)
    stolen = fresh.cookies[auth.REFRESH_COOKIE]
    assert fresh.post("/api/auth/refresh", headers=CSRF).status_code == 200
    current = fresh.cookies[auth.REFRESH_COOKIE]

    thief = TestClient(app, cookies={auth.REFRESH_COOKIE: stolen})
    assert thief.post("/api/auth/refresh", headers=CSRF).status_code == 401

    owner = TestClient(app, cookies={auth.REFRESH_COOKIE: current})
    assert owner.post("/api/auth/refresh", headers=CSRF).status_code == 401


def test_expired_refresh_token_is_refused(fresh: TestClient) -> None:
    _login(fresh, "student@medly.dev", DEMO_PASSWORD)
    raw = fresh.cookies[auth.REFRESH_COOKIE]
    with Session(engine) as session:
        row = session.exec(select(RefreshToken).where(RefreshToken.token_hash == _hash(raw))).one()
        row.expires_at = utcnow() - timedelta(seconds=1)
        session.add(row)
        session.commit()
    assert fresh.post("/api/auth/refresh", headers=CSRF).status_code == 401


def test_logout_revokes_the_refresh_token(fresh: TestClient) -> None:
    _login(fresh, "student@medly.dev", DEMO_PASSWORD)
    raw = fresh.cookies[auth.REFRESH_COOKIE]

    response = fresh.post("/api/auth/logout", headers=CSRF)
    assert response.status_code == 204
    assert _set_cookie(response)[auth.REFRESH_COOKIE].value == ""

    replay = TestClient(app, cookies={auth.REFRESH_COOKIE: raw})
    assert replay.post("/api/auth/refresh", headers=CSRF).status_code == 401


def test_logout_requires_the_csrf_header(fresh: TestClient) -> None:
    _login(fresh, "student@medly.dev", DEMO_PASSWORD)
    assert fresh.post("/api/auth/logout").status_code == 403


def test_password_change_signs_out_every_other_device() -> None:
    email = _email()
    laptop = TestClient(app)
    phone = TestClient(app)
    token = _register(laptop, email)
    _login(phone, email)

    response = laptop.post(
        "/api/auth/password",
        json={"current_password": PASSWORD, "new_password": "a-brand-new-password"},
        headers=_bearer(token),
    )
    assert response.status_code == 204

    assert phone.post("/api/auth/refresh", headers=CSRF).status_code == 401
    # The device that changed it keeps a (new) session.
    assert laptop.post("/api/auth/refresh", headers=CSRF).status_code == 200
