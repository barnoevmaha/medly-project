"""The address the per-IP login limit counts — one a client cannot choose."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.config import InsecureConfigError, validate_settings
from app.main import app
from app.routers import auth
from app.security import client_ip

SECRET = "s" * 40


def _request(headers: dict, peer: str = "10.0.0.9") -> Request:
    return Request(
        {
            "type": "http",
            "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
            "client": (peer, 1234),
        }
    )


def test_without_a_secret_the_peer_address_is_used(override_settings) -> None:
    override_settings(proxy_secret="")
    assert client_ip(_request({"X-Medly-Client-IP": "1.1.1.1"}, peer="10.0.0.9")) == "10.0.0.9"


def test_our_proxy_is_believed_with_the_secret(override_settings) -> None:
    override_settings(proxy_secret=SECRET)
    request = _request({"X-Medly-Proxy-Secret": SECRET, "X-Medly-Client-IP": "203.0.113.7"})
    assert client_ip(request) == "203.0.113.7"


def test_a_wrong_secret_is_not(override_settings) -> None:
    override_settings(proxy_secret=SECRET)
    request = _request(
        {
            "X-Medly-Proxy-Secret": "guess",
            "X-Medly-Client-IP": "198.51.100.1",
            "X-Forwarded-For": "198.51.100.1, 203.0.113.50",
        }
    )
    assert client_ip(request) == "203.0.113.50"


def test_a_forged_forwarded_entry_is_ignored(override_settings) -> None:
    """Whatever a client writes into X-Forwarded-For ends up left of the entry
    the platform's proxy appends — only that last entry is believed."""
    override_settings(proxy_secret=SECRET)
    request = _request({"X-Forwarded-For": "6.6.6.6, 7.7.7.7, 203.0.113.50"})
    assert client_ip(request) == "203.0.113.50"


def test_rotating_forged_addresses_does_not_escape_the_login_limit(
    override_settings, monkeypatch
) -> None:
    override_settings(proxy_secret=SECRET)
    monkeypatch.setattr(auth._ip_limiter, "per_minute", 2)
    client = TestClient(app)
    statuses = [
        client.post(
            "/api/auth/login",
            data={"username": f"nobody{i}@example.com", "password": "x"},
            headers={"X-Forwarded-For": f"10.9.9.{i}, 203.0.113.50"},
        ).status_code
        for i in range(3)
    ]
    assert statuses == [401, 401, 429]


def test_a_short_proxy_secret_is_refused_outside_dev() -> None:
    from dataclasses import replace

    from app import config

    insecure = replace(
        config.settings, env="production", secret_key="k" * 48, proxy_secret="short",
        refresh_cookie_samesite="none", refresh_cookie_secure=True,
    )
    with pytest.raises(InsecureConfigError, match="MEDLY_PROXY_SECRET"):
        validate_settings(insecure)
