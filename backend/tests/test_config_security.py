"""Startup refuses unsafe production settings; CORS admits only listed origins."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app import config
from app.config import DEFAULT_SECRET_KEY, InsecureConfigError, validate_settings
from app.main import app

STRONG_KEY = "k" * 48
BACKEND = Path(__file__).resolve().parent.parent


def _production(**overrides) -> config.Settings:
    from dataclasses import replace

    values = {
        "env": "production",
        "secret_key": STRONG_KEY,
        "cors_origins": ["https://medly.example"],
        "refresh_cookie_samesite": "none",
        "refresh_cookie_secure": True,
    }
    values.update(overrides)
    return replace(config.settings, **values)


def _settings_in_subprocess(env: dict, expression: str) -> str:
    """Settings are read from the environment once, at import — so a fresh
    interpreter is the only honest way to test how variables are parsed."""
    run_env = {k: v for k, v in os.environ.items() if not k.startswith("MEDLY_")}
    run_env.update(env)
    result = subprocess.run(
        [sys.executable, "-c", f"from app.config import settings; print({expression})"],
        cwd=BACKEND,
        env=run_env,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


# ------------------------------------------------------------ 1. secret key


def test_strong_production_settings_pass() -> None:
    validate_settings(_production())


def test_default_secret_is_refused_outside_dev() -> None:
    with pytest.raises(InsecureConfigError, match="built-in default"):
        validate_settings(_production(secret_key=DEFAULT_SECRET_KEY))


def test_short_secret_is_refused_outside_dev() -> None:
    with pytest.raises(InsecureConfigError, match="31 characters; at least 32"):
        validate_settings(_production(secret_key="x" * 31))


def test_any_env_other_than_dev_is_strict() -> None:
    for env in ("production", "staging", "test", ""):
        with pytest.raises(InsecureConfigError):
            validate_settings(_production(env=env, secret_key="short"))


def test_dev_allows_the_default_secret() -> None:
    validate_settings(_production(env="dev", secret_key=DEFAULT_SECRET_KEY))


def test_error_explains_how_to_fix_it() -> None:
    with pytest.raises(InsecureConfigError) as error:
        validate_settings(_production(secret_key=DEFAULT_SECRET_KEY))
    message = str(error.value)
    assert "MEDLY_SECRET_KEY" in message
    assert "secrets.token_urlsafe" in message
    assert "MEDLY_ENV=dev" in message


def test_app_does_not_start_with_an_insecure_secret(monkeypatch) -> None:
    """The check runs in the lifespan, so the server never accepts a request."""
    import app.main as main

    monkeypatch.setattr(main, "settings", _production(secret_key=DEFAULT_SECRET_KEY))
    with pytest.raises(InsecureConfigError):
        with TestClient(app):
            pass


def test_medly_env_is_read_from_the_environment() -> None:
    assert _settings_in_subprocess({"MEDLY_ENV": "dev"}, "settings.is_dev") == "True"
    assert _settings_in_subprocess({"MEDLY_ENV": "DEV "}, "settings.is_dev") == "True"
    assert _settings_in_subprocess({"MEDLY_ENV": "production"}, "settings.is_dev") == "False"
    assert _settings_in_subprocess({"MEDLY_ENV": ""}, "settings.is_dev") == "False"


# ------------------------------------------------------------ 6. CORS


def test_wildcard_origin_is_refused_outside_dev() -> None:
    with pytest.raises(InsecureConfigError, match="MEDLY_CORS_ORIGINS"):
        validate_settings(_production(cors_origins=["*"]))


def test_cors_has_no_origin_pattern() -> None:
    assert not hasattr(config.settings, "cors_origin_regex")
    cors = next(m for m in app.user_middleware if m.cls is CORSMiddleware)
    assert cors.kwargs.get("allow_origin_regex") is None
    assert cors.kwargs["allow_origins"] == config.settings.cors_origins


def test_cors_origins_come_from_the_explicit_list() -> None:
    origins = _settings_in_subprocess(
        {"MEDLY_ENV": "dev", "MEDLY_CORS_ORIGINS": "https://a.example, https://b.example"},
        "settings.cors_origins",
    )
    assert origins == "['https://a.example', 'https://b.example']"


@pytest.mark.parametrize(
    "origin",
    [
        # What the old default pattern let through.
        "https://anything.vercel.app",
        "https://attacker.up.railway.app",
        "https://x.replit.dev",
        "https://evil.example",
    ],
)
def test_unlisted_origin_gets_no_cors_headers(client: TestClient, origin: str) -> None:
    response = client.options(
        "/api/auth/login",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in response.headers


def test_listed_origin_is_allowed_with_credentials(client: TestClient) -> None:
    origin = config.settings.cors_origins[0]
    response = client.options(
        "/api/auth/refresh",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-medly-csrf",
        },
    )
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-credentials"] == "true"


# ------------------------------------------------------------ API docs


def test_api_docs_are_off_outside_dev() -> None:
    out = _settings_in_subprocess(
        {"MEDLY_ENV": "production", "MEDLY_SECRET_KEY": STRONG_KEY},
        "__import__('app.main', fromlist=['app']).app.openapi_url",
    )
    assert out == "None"


def test_api_docs_can_be_turned_on_outside_dev() -> None:
    out = _settings_in_subprocess(
        {"MEDLY_ENV": "production", "MEDLY_SECRET_KEY": STRONG_KEY, "MEDLY_API_DOCS": "true"},
        "__import__('app.main', fromlist=['app']).app.openapi_url",
    )
    assert out == "/openapi.json"


def test_api_docs_are_on_in_dev(client: TestClient) -> None:
    assert client.get("/openapi.json").status_code == 200
