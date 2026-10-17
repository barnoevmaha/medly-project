"""Translation never holds a page hostage: a budget, a memory, and cooldowns.

Providers are replaced with fakes; no test here touches the network.
"""
from __future__ import annotations

import time

from app.services import medical_translate as mt
from app.services import translate

RU = "ru"


def test_a_slow_provider_does_not_hold_the_request(monkeypatch, override_settings) -> None:
    override_settings(free_translate_fallback=False)

    def slow(texts, target):
        time.sleep(0.6)
        return [f"[ru] {text}" for text in texts]

    monkeypatch.setattr(mt, "_gemini_batch", slow)
    monkeypatch.setattr(mt, "validation_error", lambda *args: None)

    started = time.monotonic()
    out = mt.translate_batch(["Sepsis is an emergency."], RU, budget_seconds=0.1)
    assert time.monotonic() - started < 0.5
    assert out == ["Sepsis is an emergency."]  # English, for now

    time.sleep(0.8)  # the overrunning work finishes in the background
    started = time.monotonic()
    out = mt.translate_batch(["Sepsis is an emergency."], RU, budget_seconds=0.1)
    assert out == ["[ru] Sepsis is an emergency."]
    assert time.monotonic() - started < 0.1  # served from memory, no new call


def test_chunks_are_translated_in_parallel(monkeypatch, override_settings) -> None:
    override_settings(free_translate_fallback=False)
    monkeypatch.setattr(mt, "MAX_BATCH_ITEMS", 1)
    monkeypatch.setattr(mt, "validation_error", lambda *args: None)

    def slow(texts, target):
        time.sleep(0.3)
        return [f"[ru] {text}" for text in texts]

    monkeypatch.setattr(mt, "_gemini_batch", slow)
    texts = [f"Sentence number {i} about sepsis." for i in range(4)]
    started = time.monotonic()
    out = mt.translate_batch(texts, RU, budget_seconds=5)
    assert out == [f"[ru] {text}" for text in texts]
    assert time.monotonic() - started < 0.9  # four 0.3s chunks, not 1.2s in a row


def test_a_zero_budget_waits_for_everything(monkeypatch, override_settings) -> None:
    """What the warm-up script uses."""
    override_settings(free_translate_fallback=False)
    monkeypatch.setattr(mt, "validation_error", lambda *args: None)

    def slow(texts, target):
        time.sleep(0.3)
        return [f"[ru] {text}" for text in texts]

    monkeypatch.setattr(mt, "_gemini_batch", slow)
    assert mt.translate_batch(["Long enough text here."], RU, budget_seconds=0) == ["[ru] Long enough text here."]


def test_the_free_fallback_can_be_switched_off(monkeypatch, override_settings) -> None:
    override_settings(free_translate_fallback=False)
    monkeypatch.setattr(mt, "_gemini_batch", lambda texts, target: None)
    called = []
    monkeypatch.setattr(mt, "translate_text", lambda *args: called.append(args) or "x")
    assert mt.translate_batch(["Community description text."], RU) == ["Community description text."]
    assert called == []


def test_a_failed_free_provider_is_skipped_for_a_while(monkeypatch) -> None:
    calls = {"google": 0, "mymemory": 0}

    def google(text, target, source):
        calls["google"] += 1
        return None

    def mymemory(text, target, source):
        calls["mymemory"] += 1
        return None

    monkeypatch.setattr(translate, "_google_translate", google)
    monkeypatch.setattr(translate, "_mymemory_translate", mymemory)
    for _ in range(5):
        assert translate.translate_text("Hello world", RU) == "Hello world"
    assert calls == {"google": 1, "mymemory": 1}


def test_gemini_is_rested_after_an_outage(monkeypatch, override_settings) -> None:
    from app.services import gemini

    override_settings(gemini_api_key="test-key", free_translate_fallback=False)
    calls = []

    def down(**kwargs):
        calls.append(kwargs)
        raise gemini.GeminiUnavailable("network down")

    monkeypatch.setattr(gemini, "generate", down)
    mt.translate_batch(["First sentence about sepsis."], RU)
    mt.translate_batch(["Second sentence about sepsis."], RU)
    assert len(calls) == 1
