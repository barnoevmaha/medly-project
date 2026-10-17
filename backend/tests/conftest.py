from __future__ import annotations

import os
import sys
import tempfile
from dataclasses import replace
from typing import Callable, Iterator

import httpx
import pytest

# Demo accounts, the demo checkout and a short signing key are dev-only; the
# suite runs as dev and tests the production rules by overriding settings.
os.environ["MEDLY_ENV"] = "dev"
os.environ.setdefault("MEDLY_SECRET_KEY", "test-secret")
_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.environ["MEDLY_DATABASE_URL"] = f"sqlite:///{_db_path}"

from fastapi.testclient import TestClient  # noqa: E402

from app import config  # noqa: E402
from app.db import init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import DEMO_PASSWORD, run as seed_run  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _database() -> Iterator[None]:
    init_db()
    seed_run()
    yield
    os.close(_db_fd)
    os.unlink(_db_path)


@pytest.fixture(autouse=True)
def _fresh_process_state() -> Iterator[None]:
    """Every test logs in through the fixtures below, so the brute-force limits
    on /api/auth would trip partway through the suite if they carried over.
    The same goes for the per-user posting limit — the demo accounts are
    shared by every test that comments or posts."""
    from app.routers import auth

    from app.services import medical_translate, posting, translate
    from app.services import virtual_patient_service

    auth._ip_limiter.reset()
    auth._email_limiter.reset()
    posting.reset()
    virtual_patient_service._limiter.reset()
    # Process-wide memory of past translations and provider outages: one
    # test's simulated outage must not switch a provider off for the next.
    medical_translate.reset()
    translate.reset_cooldowns()
    yield


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def _token(client: TestClient, email: str) -> str:
    response = client.post(
        "/api/auth/login", data={"username": email, "password": DEMO_PASSWORD}
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.fixture
def student_headers(client: TestClient) -> dict:
    return {"Authorization": f"Bearer {_token(client, 'student@medly.dev')}"}


@pytest.fixture
def premium_headers(client: TestClient) -> dict:
    return {"Authorization": f"Bearer {_token(client, 'premium@medly.dev')}"}


@pytest.fixture
def instructor_headers(client: TestClient) -> dict:
    return {"Authorization": f"Bearer {_token(client, 'instructor@medly.dev')}"}


@pytest.fixture
def override_settings(monkeypatch) -> Callable[..., config.Settings]:
    """Swap in a copy of `settings` with some fields changed, for one test.

    Settings is a frozen dataclass — production code relies on that
    immutability, so tests cannot monkeypatch attributes on the live instance
    (that raises `dataclasses.FrozenInstanceError`). Instead, build a
    replacement with the overridden fields and point every `app` module that
    holds its own `from app.config import settings` reference at it. Modules are
    found by identity rather than listed, so a new consumer of `settings` is
    covered without touching this fixture. Calling it twice in one test stacks
    the overrides; monkeypatch restores the original afterwards.
    """
    def apply(**overrides) -> config.Settings:
        current = config.settings
        new_settings = replace(current, **overrides)
        for name, module in list(sys.modules.items()):
            if (name == "app" or name.startswith("app.")) and getattr(module, "settings", None) is current:
                monkeypatch.setattr(module, "settings", new_settings)
        return new_settings

    return apply


@pytest.fixture
def outbound_http(monkeypatch) -> Callable[[Callable], None]:
    """Route the app's own outbound HTTP (Gemini) through `handler`.

    `gemini.py` opens a bare `httpx.Client()` per call, so faking it means
    patching `httpx.Client.post` and `.stream` at the class level. `TestClient`
    is also an `httpx.Client` subclass and dispatches through those same
    methods — patched carelessly, the test's own call into the FastAPI app
    would hit the handler. Only exact `httpx.Client` instances are redirected;
    anything else falls through to the real implementation.
    """
    def install(handler: Callable) -> None:
        for method in ("post", "stream"):
            real = getattr(httpx.Client, method)

            def patched(self, *args, _real=real, **kwargs):
                if type(self) is not httpx.Client:
                    return _real(self, *args, **kwargs)
                return handler(*args, **kwargs)

            monkeypatch.setattr(httpx.Client, method, patched)

    return install


@pytest.fixture
def admin_headers(client: TestClient) -> dict:
    return {"Authorization": f"Bearer {_token(client, 'admin@medly.dev')}"}
