"""Virtual Patient: what narration costs, and what a perfect run scores.

`gemini.generate` is replaced by a counter, so "no call was made" is an
assertion about the provider, not about what came back.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db import engine
from app.models.virtual_patient import VirtualPatientCase
from app.services import gemini
from app.services import virtual_patient_service as narration
from app.services.virtual_patient_engine import max_score_for
from tests.test_virtual_patient import CASE, decide, fresh_start


@pytest.fixture
def model(monkeypatch, override_settings):
    """Narration configured, every call counted and answered.

    The free translation services are switched off too: a Russian request
    translates the case first, and that must not reach the network.
    """
    override_settings(vp_gemini_api_key="test-key", free_translate_fallback=False)
    calls: list[dict] = []

    def generate(**kwargs):
        calls.append(kwargs)
        return gemini.GeminiResult(text="Model-written text.", model="fake", latency_ms=1)

    monkeypatch.setattr(narration.gemini, "generate", generate)
    return calls


def _debriefs(calls: list[dict]) -> list[dict]:
    return [c for c in calls if c["system_prompt"].startswith(narration.DEBRIEF_SYSTEM_PROMPT[:40])]


def _play_clean_run(client: TestClient, headers: dict) -> int:
    sid = fresh_start(client, headers)["session_id"]
    decide(client, headers, sid, "arrival", "abcde")
    decide(client, headers, sid, "history", "curb65_3")
    decide(client, headers, sid, "sepsis_six", "sepsis_six_bundle")
    decide(client, headers, sid, "response", "admit_ward")
    return sid


def test_narration_past_the_limit_uses_authored_text_without_a_call(
    model, monkeypatch
) -> None:
    monkeypatch.setattr(narration._limiter, "per_minute", 2)
    said = [
        narration.patient_says(
            case_brief="b", patient_name="R", patient_age=70, patient_sex="male",
            situation="s", authored_line="Authored line.", user_id=4242,
        )
        for _ in range(4)
    ]
    assert [s.used_model for s in said] == [True, True, False, False]
    assert said[-1].text == "Authored line."
    assert len(model) == 2


def test_the_limit_is_per_user(model, monkeypatch) -> None:
    monkeypatch.setattr(narration._limiter, "per_minute", 1)
    kwargs = dict(case_brief="b", patient_name="R", patient_age=70, patient_sex="male",
                  situation="s", authored_line="Authored line.")
    assert narration.patient_says(user_id=1, **kwargs).used_model
    assert narration.patient_says(user_id=2, **kwargs).used_model
    assert not narration.patient_says(user_id=1, **kwargs).used_model


def test_unconfigured_narration_spends_nothing(override_settings) -> None:
    override_settings(vp_gemini_api_key="", gemini_api_key="")
    for _ in range(50):
        narration.patient_says(
            case_brief="b", patient_name="R", patient_age=70, patient_sex="male",
            situation="s", authored_line="Authored.", user_id=77,
        )
    assert narration._limiter.check("vp:77").allowed  # no budget was consumed


def test_debrief_is_written_once_per_run_and_language(
    client: TestClient, student_headers: dict, model, outbound_http
) -> None:
    sid = _play_clean_run(client, student_headers)
    path = f"/api/virtual-patient/sessions/{sid}/result"

    first = client.get(path, headers=student_headers).json()
    again = client.get(path, headers=student_headers).json()
    assert first["debrief"] == again["debrief"] == "Model-written text."
    assert again["debrief_narrated"] is True
    assert len(_debriefs(model)) == 1

    client.get(path, headers={**student_headers, "X-Medly-Lang": "ru"})
    assert len(_debriefs(model)) == 2


def test_a_fallback_debrief_is_not_cached(
    client: TestClient, student_headers: dict, model, monkeypatch, outbound_http
) -> None:
    sid = _play_clean_run(client, student_headers)
    monkeypatch.setattr(narration, "is_configured", lambda: False)
    fallback = client.get(f"/api/virtual-patient/sessions/{sid}/result", headers=student_headers).json()
    assert fallback["debrief_narrated"] is False

    monkeypatch.setattr(narration, "is_configured", lambda: True)
    written = client.get(f"/api/virtual-patient/sessions/{sid}/result", headers=student_headers).json()
    assert written["debrief_narrated"] is True


def test_max_score_is_the_best_reachable_path() -> None:
    with Session(engine) as session:
        case = session.exec(select(VirtualPatientCase).where(VirtualPatientCase.slug == CASE)).one()
        # The "deterioration" detour is only reachable after a mistake, so its
        # points cannot be added to a clean run's.
        assert max_score_for(session, case.id) == 100


def test_a_flawless_run_scores_full_marks(client: TestClient, student_headers: dict, outbound_http, override_settings) -> None:
    override_settings(vp_gemini_api_key="", gemini_api_key="")
    sid = _play_clean_run(client, student_headers)
    state = client.get(f"/api/virtual-patient/sessions/{sid}", headers=student_headers).json()
    assert state["score"] == state["max_score"] == 100
