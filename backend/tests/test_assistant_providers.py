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


# The SDK error classes AnthropicProvider maps; checked against the real
# package below so the fake cannot drift from it.
SDK_ERRORS = (
    "RateLimitError", "OverloadedError", "ServiceUnavailableError", "InternalServerError",
    "APIConnectionError", "AuthenticationError", "PermissionDeniedError",
    "CredentialsError", "NotFoundError", "BadRequestError",
)


@pytest.fixture
def fake_anthropic(monkeypatch):
    """A stand-in `anthropic` package that records the request it is sent.

    Keeps the tests offline; what matters is the request this provider builds
    and how it reads the response. `reply["raise"]` makes the call fail, and
    `reply["chunks"]` is what a stream yields before its final message."""
    sent: dict = {}
    reply = {"stop_reason": "end_turn", "content": [], "chunks": [], "raise": None}

    module = types.ModuleType("anthropic")
    module.AnthropicError = type("AnthropicError", (Exception,), {})
    for name in SDK_ERRORS:
        setattr(module, name, type(name, (module.AnthropicError,), {}))

    def final():
        return SimpleNamespace(
            model=sent["model"], stop_reason=reply["stop_reason"], content=reply["content"]
        )

    class Stream:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        @property
        def text_stream(self):
            for chunk in reply["chunks"]:
                if isinstance(chunk, Exception):
                    raise chunk
                yield chunk

        def get_final_message(self):
            return final()

    class Messages:
        def create(self, **kwargs):
            sent.update(kwargs)
            if reply["raise"]:
                raise reply["raise"]
            return final()

        def stream(self, **kwargs):
            sent.update(kwargs)
            sent["streamed"] = True
            if reply["raise"]:
                raise reply["raise"]
            return Stream()

    class Anthropic:
        def __init__(self, api_key=None):
            sent["api_key"] = api_key
            self.beta = SimpleNamespace(messages=Messages())

    module.Anthropic = Anthropic
    monkeypatch.setitem(sys.modules, "anthropic", module)
    return sent, reply, module


def test_the_real_sdk_has_what_the_provider_uses() -> None:
    """The fake above mirrors these; this pins them to the installed SDK."""
    import inspect

    import anthropic
    from anthropic.resources.beta.messages import Messages

    for name in SDK_ERRORS + ("AnthropicError",):
        assert issubclass(getattr(anthropic, name), Exception), name
    for method in (Messages.create, Messages.stream):
        params = inspect.signature(method).parameters
        assert {"fallbacks", "output_config", "betas", "system"} <= set(params), method


def test_anthropic_request_uses_the_current_model_and_medly_prompt(fake_anthropic, override_settings) -> None:
    override_settings(anthropic_api_key="", anthropic_model="claude-opus-5-5")
    sent, reply, _ = fake_anthropic
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
    sent, reply, _ = fake_anthropic
    reply["content"] = [SimpleNamespace(type="text", text="ok")]
    AnthropicProvider().reply("What is sepsis?", [], None, "en")
    assert sent["model"] == "claude-sonnet-5-5"


def test_an_anthropic_refusal_is_said_plainly(fake_anthropic) -> None:
    _, reply, _ = fake_anthropic
    reply["stop_reason"] = "refusal"
    reply["content"] = []
    answer = AnthropicProvider().reply("something declined", [], None, "en")
    assert "can't help" in answer.content
    assert answer.provider.endswith("(refused)")


def test_anthropic_streams_fragments_with_the_same_request(fake_anthropic) -> None:
    sent, reply, _ = fake_anthropic
    reply["chunks"] = ["Sepsis ", "", "is a dysregulated response."]
    provider = AnthropicProvider()
    assert hasattr(provider, "stream")  # the router answers 501 without it

    pieces = list(provider.stream("What is sepsis?", [], None, "en"))

    assert pieces == ["Sepsis ", "is a dysregulated response."]
    assert sent["streamed"] is True
    assert sent["fallbacks"] == "default" and sent["output_config"] == {"effort": "low"}


@pytest.mark.parametrize("partial", [[], ["Partial answer"]])
def test_an_anthropic_stream_refusal_is_said_plainly(fake_anthropic, partial) -> None:
    _, reply, _ = fake_anthropic
    reply["chunks"] = partial
    reply["stop_reason"] = "refusal"
    pieces = list(AnthropicProvider().stream("something declined", [], None, "en"))
    assert pieces[: len(partial)] == partial
    assert "can't help" in pieces[-1]


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        ("RateLimitError", "GeminiRateLimited"),
        ("OverloadedError", "GeminiUnavailable"),
        ("ServiceUnavailableError", "GeminiUnavailable"),
        ("InternalServerError", "GeminiUnavailable"),
        ("APIConnectionError", "GeminiUnavailable"),
        ("AuthenticationError", "GeminiAuthError"),
        ("PermissionDeniedError", "GeminiAuthError"),
        ("NotFoundError", "GeminiModelNotFound"),
    ],
)
@pytest.mark.parametrize("mode", ["reply", "stream", "mid-stream"])
def test_anthropic_errors_become_the_errors_the_router_acts_on(
    fake_anthropic, error: str, expected: str, mode: str
) -> None:
    from app.services import gemini

    _, reply, module = fake_anthropic
    exc = getattr(module, error)("boom")
    if mode == "mid-stream":
        reply["chunks"] = [exc]
    else:
        reply["raise"] = exc
    provider = AnthropicProvider()
    with pytest.raises(getattr(gemini, expected)):
        if mode == "reply":
            provider.reply("q", [], None, "en")
        else:
            list(provider.stream("q", [], None, "en"))


def test_an_unmapped_anthropic_error_is_left_alone(fake_anthropic) -> None:
    _, reply, module = fake_anthropic
    reply["raise"] = module.BadRequestError("bad request")
    with pytest.raises(module.BadRequestError):
        list(AnthropicProvider().stream("q", [], None, "en"))


def test_the_stream_endpoint_answers_with_anthropic(
    client: TestClient, fake_anthropic, override_settings
) -> None:
    """The bug: only Gemini could stream, so this endpoint said 501."""
    override_settings(assistant_provider="anthropic", anthropic_model="claude-sonnet-5-5")
    assistant_router._limiter.reset()
    _, reply, _ = fake_anthropic
    reply["chunks"] = ["Sepsis is ", "a dysregulated response."]

    response = client.post(
        "/api/assistant/chat/stream", json={"message": "Explain sepsis"}, headers=_headers(client)
    )

    assert response.status_code == 200
    assert "Sepsis is " in response.text and "a dysregulated response." in response.text
    assert '"model": "claude-sonnet-5-5"' in response.text
    assert "event: error" not in response.text


def test_an_overloaded_anthropic_stream_falls_back_to_the_offline_engine(
    client: TestClient, fake_anthropic, override_settings
) -> None:
    override_settings(assistant_provider="anthropic")
    assistant_router._limiter.reset()
    _, reply, module = fake_anthropic
    reply["raise"] = module.OverloadedError("overloaded")

    response = client.post(
        "/api/assistant/chat/stream", json={"message": "Explain sepsis"}, headers=_headers(client)
    )

    assert response.status_code == 200
    assert "event: error" not in response.text
    assert assistant_router.FALLBACK_NOTICE in response.text


def test_the_blocking_endpoint_reports_the_anthropic_model(
    client: TestClient, fake_anthropic, override_settings
) -> None:
    override_settings(assistant_provider="anthropic", anthropic_model="claude-sonnet-5-5")
    assistant_router._limiter.reset()
    _, reply, _ = fake_anthropic
    reply["content"] = [SimpleNamespace(type="text", text="Sepsis is a dysregulated response.")]

    response = client.post(
        "/api/assistant/chat", json={"message": "Explain sepsis"}, headers=_headers(client)
    )

    assert response.status_code == 200, response.text
    assert response.json()["model"] == "claude-sonnet-5-5"
    assert response.json()["provider"] == "anthropic:claude-sonnet-5-5"


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
