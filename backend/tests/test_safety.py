"""The guardrails are the product, so they get the most tests."""
from __future__ import annotations

import pytest

from app.models.enums import RiskLevel
from app.services import safety


@pytest.mark.parametrize(
    "message",
    [
        "My patient has chest pain, what is the diagnosis?",
        "Should I prescribe amoxicillin?",
        "What dose of heparin do I give?",
        "Is this malignant?",
        "Can I discharge them now?",
    ],
)
def test_clinical_directives_are_refused(message: str) -> None:
    verdict = safety.screen_message(message)
    assert verdict.blocked
    assert verdict.risk_level is RiskLevel.HIGH
    assert verdict.refusal_message


@pytest.mark.parametrize(
    "message",
    [
        "Patient MRN 4429183 presented today",
        "DOB 04/11/1998, chest film",
        "Email me at someone@example.com",
        "SSN 123-45-6789",
    ],
)
def test_identifiers_are_refused_and_redacted(message: str) -> None:
    verdict = safety.screen_message(message)
    assert verdict.blocked
    assert "[redacted]" in verdict.redacted_text


@pytest.mark.parametrize(
    "message",
    [
        "What is automation bias?",
        "Explain sensitivity versus specificity",
        "How does a CNN classify a chest X-ray?",
        "What is the ALARA principle?",
    ],
)
def test_teaching_questions_are_allowed(message: str) -> None:
    assert safety.screen_message(message).allowed


def test_imaging_topics_are_medium_risk() -> None:
    assert safety.classify_risk("How do I read a chest x-ray?") is RiskLevel.MEDIUM
    assert safety.classify_risk("What is automation bias?") is RiskLevel.LOW


def test_disclaimer_is_always_appended() -> None:
    for risk in RiskLevel:
        assert "Educational use only" in safety.apply_disclaimer("Answer.", risk)


def test_low_confidence_triggers_review() -> None:
    mean, uncertain, review = safety.evaluate_confidence([0.55, 0.60])
    assert uncertain and review and mean < 0.7

    mean, uncertain, review = safety.evaluate_confidence([0.92, 0.88])
    assert not uncertain and not review and mean > 0.85


def test_empty_confidence_is_treated_as_uncertain() -> None:
    mean, uncertain, review = safety.evaluate_confidence([])
    assert mean == 0.0 and uncertain and review


# ------------------------------------------------- every language the app speaks


@pytest.mark.parametrize(
    "message",
    [
        # Russian
        "Должен ли я выписать моего пациента с болью в груди?",
        "Какую дозу гепарина мне дать?",
        "Можно ли мне выписать его домой?",
        "Это рак?",
        # Uzbek
        "Bemorimga qanday doza berishim kerak?",
        "Qanday doza berishim kerak?",
        "Bu saratonmi?",
        # English, first person
        "How much morphine should I give him?",
    ],
)
def test_clinical_directives_are_refused_in_every_language(message: str) -> None:
    verdict = safety.screen_message(message)
    assert verdict.blocked, message
    assert verdict.risk_level is RiskLevel.HIGH


@pytest.mark.parametrize(
    "message",
    [
        # How textbook vignettes and pharmacology questions are written.
        "In a textbook case the patient has fever and cough, what is the differential?",
        "This patient in the vignette has a raised troponin. Explain why.",
        "What dose of adrenaline is used in anaphylaxis according to guidelines?",
        "Какая доза адреналина используется при анафилаксии?",
        "Пациент в задаче жалуется на боль в груди. Объясни патогенез.",
        "Это рак лёгкого, который чаще встречается у курильщиков — почему?",
        "Anafilaksiyada adrenalinning qanday dozasi qo'llaniladi?",
        "Bemor isitma bilan keldi, differensial tashxisni tushuntiring",
    ],
)
def test_teaching_phrasing_is_not_mistaken_for_a_real_patient(message: str) -> None:
    assert safety.screen_message(message).allowed, message


@pytest.mark.parametrize(
    "message",
    [
        "Пациент Иванов, дата рождения 12.05.1980",
        "Patient born 1980-05-12",
        "John Smith, born May 12 1980, has a lung nodule",
        "DOB 12 March 1975, chest film",
    ],
)
def test_dates_of_birth_in_any_format_are_refused(message: str) -> None:
    verdict = safety.screen_message(message)
    assert verdict.blocked, message
    assert "Contains a date of birth" in verdict.reasons
