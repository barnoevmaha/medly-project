"""Provider wiring and the chat endpoints' error edges."""
from __future__ import annotations

import sys
import types
import uuid
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from app.routers import assistant as assistant_router
from app.services import assistant as assistant_service
from app.services.assistant import MEDLY_AI_SYSTEM_PROMPT, AnthropicProvider


def _headers(client: TestClient) -> dict:
    response = client.post(
        "/api/auth/register",
        json={"email": f"prov-{uuid.uuid4().hex[:10]}@example.com", "password": "password123",
              "full_name": "Provider Test"},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


# ------------------------------------------------------------ Anthropic


@pytest.fixture
def fake_anthropic(monkeypatch):
    """A stand-in `anthropic` package that records the request it is sent.

    The SDK is optional and not installed here; what matters is the request
    this provider builds and how it reads the response."""
    sent: dict = {}
    reply = {"stop_reason": "end_turn", "content": []}

    class Messages:
        def create(self, **kwargs):
            sent.update(kwargs)
            return SimpleNamespace(model=kwargs["model"], **reply)

    class Anthropic:
        def __init__(self, api_key=None):
            sent["api_key"] = api_key
            self.beta = SimpleNamespace(messages=Messages())

    module = types.ModuleType("anthropic")
    module.Anthropic = Anthropic
    monkeypatch.setitem(sys.modules, "anthropic", module)
    return sent, reply


def test_anthropic_request_uses_the_current_model_and_medly_prompt(fake_anthropic, override_settings) -> None:
    override_settings(anthropic_api_key="", anthropic_model="claude-opus-5-5")
    sent, reply = fake_anthropic
    reply["content"] = [
        SimpleNamespace(type="thinking", thinking=""),
        SimpleNamespace(type="text", text="Sepsis is "),
        SimpleNamespace(type="text", text="a dysregulated response."),
    ]
    answer = AnthropicProvider().reply("What is sepsis?", [{"role": "user", "content": "hi"}], "CONTEXT", "en")

    assert answer.content == "Sepsis is a dysregulated response."
    assert answer.provider == "anthropic:claude-opus-5-5"
    assert sent["model"] == "claude-opus-5-5"
    assert sent["system"].startswith(MEDLY_AI_SYSTEM_PROMPT[:60]) and sent["system"].endswith("CONTEXT")
    assert sent["output_config"] == {"effort": "low"}
    assert sent["fallbacks"] == "default"
    assert sent["betas"] == ["server-side-fallback-2026-07-01"]
    assert sent["messages"][-1] == {"role": "user", "content": "What is sepsis?"}
    assert sent["api_key"] is None  # empty key -> let the SDK resolve credentials


def test_anthropic_model_is_configurable(fake_anthropic, override_settings) -> None:
    override_settings(anthropic_model="claude-sonnet-5-5")
    sent, reply = fake_anthropic
    reply["content"] = [SimpleNamespace(type="text", text="ok")]
    AnthropicProvider().reply("What is sepsis?", [], None, "en")
    assert sent["model"] == "claude-sonnet-5-5"


def test_an_anthropic_refusal_is_said_plainly(fake_anthropic) -> None:
    _, reply = fake_anthropic
    reply["stop_reason"] = "refusal"
    reply["content"] = []
    answer = AnthropicProvider().reply("something declined", [], None, "en")
    assert "can't help" in answer.content
    assert answer.provider.endswith("(refused)")


@pytest.mark.parametrize("provider", ["gemini", "anthropic", "openai"])
def test_live_providers_suggest_medical_prompts(override_settings, provider: str) -> None:
    override_settings(assistant_provider=provider)
    assert assistant_service.suggested_prompts() == assistant_service.MEDICAL_PROMPTS


def test_the_offline_engine_suggests_what_it_can_answer(override_settings) -> None:
    override_settings(assistant_provider="rules")
    assert assistant_service.suggested_prompts() == assistant_service.AI_SAFETY_PROMPTS


# ------------------------------------------------------------ rate limit header


@pytest.mark.parametrize("path", ["/api/assistant/chat", "/api/assistant/chat/stream"])
def test_a_rate_limited_answer_says_when_to_retry(
    client: TestClient, monkeypatch, override_settings, outbound_http, path: str
) -> None:
    override_settings(assistant_provider="gemini", gemini_api_key="test-key")
    monkeypatch.setattr(assistant_router._limiter, "per_minute", 0)
    response = client.post(path, json={"message": "Explain sepsis"}, headers=_headers(client))
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) >= 1
    assistant_router._limiter.reset()


# ------------------------------------------------------------ stream network failure


def test_a_network_failure_before_streaming_falls_back_to_the_offline_engine(
    client: TestClient, override_settings, outbound_http
) -> None:
    override_settings(assistant_provider="gemini", gemini_api_key="test-key")
    assistant_router._limiter.reset()

    def unreachable(*args, **kwargs):
        raise httpx.ConnectError("network unreachable")

    outbound_http(unreachable)
    response = client.post(
        "/api/assistant/chat/stream", json={"message": "Explain sepsis"}, headers=_headers(client)
    )
    assert response.status_code == 200
    assert "event: error" not in response.text
    assert assistant_router.FALLBACK_NOTICE in response.text


def test_a_zero_limit_refuses_instead_of_crashing() -> None:
    from app.services.ratelimit import SlidingWindowLimiter

    assert SlidingWindowLimiter(0, 10).check("k").allowed is False
    assert SlidingWindowLimiter(10, 0).check("k").retry_after_seconds >= 1
