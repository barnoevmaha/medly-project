"""The guardrail layer.

This module is the product. The hackathon premise is that AI is already being
used on X-ray and CT without agreed safety standards; this file encodes those
standards as executable rules rather than a PDF nobody reads.

Five rules, applied to every AI interaction:

  1. Scope    - the assistant teaches, it does not diagnose real patients.
  2. Identify - anything that looks like patient identifiers is refused.
  3. Caveat   - every output carries a disclaimer, always, with no opt-out.
  4. Confidence - low-confidence model output is flagged, never shown bare.
  5. Trace   - every interaction is written to the audit log.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from app.config import settings
from app.models.enums import RiskLevel

# --------------------------------------------------------------------------
# Rule 1 & 2 - patterns that must never be answered by a teaching assistant.
# --------------------------------------------------------------------------

# Asking the tool to make the call on a real, present patient.
#
# Two things these must get right at once. They must catch a request to decide
# something for a patient the asker is treating — in every language the app
# speaks, or a Russian or Uzbek student is simply not covered. And they must
# not catch the ordinary phrasing of teaching material: "the patient has a
# fever" is how every textbook vignette is written, and "what dose of
# adrenaline is used in anaphylaxis" is a pharmacology question. So the
# triggers are possessive ("my patient") or first-person ("should I give"),
# never a bare "the patient" or "what dose".
CLINICAL_DIRECTIVE_PATTERNS: List[Tuple[str, str]] = [
    # --- English ---
    (r"\b(?:my|our)\s+(?:real\s+)?patients?\b", "Request concerns a real patient"),
    (r"\breal\s+patients?\b", "Request concerns a real patient"),
    (r"\bshould\s+(?:i|we)\s+(?:prescribe|administer|give|start|stop|discharge|operate)\b",
     "Request asks for a treatment decision"),
    (r"\b(?:what|which)\s+(?:dose|dosage)\b[^.?!]*\b(?:do|should|can|must)\s+(?:i|we)\b",
     "Request asks for a dosing decision"),
    (r"\bhow\s+much\b[^.?!]*\b(?:do|should|can|must)\s+(?:i|we)\s+(?:give|prescribe|administer)\b",
     "Request asks for a dosing decision"),
    (r"\bis\s+(?:it|this)\s+(?:cancer|malignant|benign|a\s+tumou?r)\b",
     "Request asks for a definitive diagnosis"),
    (r"\bdiagnos(?:e|is)\s+(?:this|my|the)\s+(?:patient|scan|x-?ray|ct)\b",
     "Request asks for a definitive diagnosis"),
    (r"\bwhat\s+diagnosis\b", "Request asks for a definitive diagnosis"),
    (r"\b(?:what's|what\s+is)\s+the\s+diagnosis\b", "Request asks for a definitive diagnosis"),
    (r"\btell me (?:the |what )?diagnosis\b", "Request asks for a definitive diagnosis"),
    (r"\bcan\s+(?:i|we)\s+discharge\b", "Request asks for a disposition decision"),
    # --- Russian ---
    (r"\b(?:мо[йеяию]\w*|наш\w*)\s+(?:реальн\w+\s+)?пациент\w*", "Request concerns a real patient"),
    (r"\bреальн\w+\s+пациент\w*", "Request concerns a real patient"),
    (r"\b(?:должен|должна|должны|стоит|можно|нужно|надо)\s+ли\s+(?:я\s+|мы\s+|мне\s+|нам\s+)?"
     r"(?:назнач|выписа|да(?:ть|вать)|ввести|ввод|отмен|начать|прекрат|оперир)",
     "Request asks for a treatment decision"),
    (r"\b(?:какую|какая|какой)\s+доз\w*\b[^.?!]*\b(?:дать|давать|назначить|ввести|мне|нам)\b",
     "Request asks for a dosing decision"),
    (r"\bсколько\b[^.?!]*\b(?:мне|нам)\s+(?:дать|давать|назначить|ввести)\b",
     "Request asks for a dosing decision"),
    # Only as a question: "это рак лёгкого, который…" is a statement.
    (r"\bэто\s+(?:рак|злокачествен|доброкачествен|опухол)\w*(?:\s+или\s+нет)?\s*\?",
     "Request asks for a definitive diagnosis"),
    (r"\b(?:поставь(?:те)?|постав(?:ить|ьте))\s+(?:мне\s+)?диагноз\b",
     "Request asks for a definitive diagnosis"),
    (r"\bкакой\s+у\s+(?:него|неё|нее|пациента|моего\s+пациента)\s+диагноз\b",
     "Request asks for a definitive diagnosis"),
    # --- Uzbek (Latin; both apostrophe forms) ---
    (r"\bbemor(?:im|imiz)\w*", "Request concerns a real patient"),
    (r"\bhaqiqiy\s+bemor\w*", "Request concerns a real patient"),
    (r"\b(?:qanday|qancha|necha)\s+doza\w*[^.?!]*\b(?:berishim|beraymi|beramiz|tayinlashim|tayinlaymi)\b",
     "Request asks for a dosing decision"),
    (r"\b(?:tayinlashim|berishim|chiqarishim|to[ʻ'’`]xtatishim)\s+kerak", "Request asks for a treatment decision"),
    (r"\btashxis\s+(?:qo[ʻ'’`]y|ayt)\w*", "Request asks for a definitive diagnosis"),
    # "-mi" makes it a question: "bu saratonmi?" — is this cancer?
    (r"\bbu\s+(?:saraton|o[ʻ'’`]sma)\w*mi\b", "Request asks for a definitive diagnosis"),
]

# Protected identifiers that should never reach an AI service. Dates of birth
# come in every shape the app's users write them: 04/11/1998, 04.11.1998
# (Russian and Uzbek convention), 1998-11-04, and "born May 12 1980".
_MONTHS = (
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|"
    r"sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
)
PHI_PATTERNS: List[Tuple[str, str]] = [
    (r"\b\d{3}-\d{2}-\d{4}\b", "Looks like a social security number"),
    (r"\bMRN[:\s#]*\d+\b", "Contains a medical record number"),
    (r"\b\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}\b", "Contains a date of birth"),
    (r"\b(?:19|20)\d{2}-\d{2}-\d{2}\b", "Contains a date of birth"),
    (r"\b(?:born|dob|d\.o\.b\.?|date\s+of\s+birth)\b[^.?!\n]{0,20}?\b" + _MONTHS
     + r"\b\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(?:19|20)\d{2}\b",
     "Contains a date of birth"),
    (r"\b(?:born|dob|date\s+of\s+birth)\b[^.?!\n]{0,20}?\b\d{1,2}(?:st|nd|rd|th)?\s+"
     + _MONTHS + r"\b\.?,?\s+(?:19|20)\d{2}\b",
     "Contains a date of birth"),
    (r"\b[\w.+-]+@[\w-]+\.[\w.]+\b", "Contains an email address"),
    (r"\b(?:\+?\d[\d\s().-]{8,}\d)\b", "Contains what may be a phone number"),
]

# Topics that are fine to teach but warrant a heightened caveat.
ELEVATED_TOPIC_PATTERNS: List[str] = [
    r"\bx-?ray\b", r"\bct\b", r"\bmri\b", r"\bradiograph\b", r"\bscan\b",
    r"\bpneumonia\b", r"\bnodule\b", r"\bfracture\b", r"\beffusion\b",
    r"\bmalignan\w*\b", r"\bdifferential\b",
]


@dataclass
class SafetyVerdict:
    """The result of running a message past the guardrails."""

    allowed: bool
    risk_level: RiskLevel
    reasons: List[str] = field(default_factory=list)
    redacted_text: str = ""
    refusal_message: Optional[str] = None

    @property
    def blocked(self) -> bool:
        return not self.allowed


def _matches(text: str, patterns: List[Tuple[str, str]]) -> List[str]:
    found: List[str] = []
    for pattern, label in patterns:
        if re.search(pattern, text, flags=re.IGNORECASE):
            found.append(label)
    return found


def redact(text: str) -> str:
    """Strip anything identifier-shaped before it is stored or forwarded."""
    cleaned = text
    for pattern, _ in PHI_PATTERNS:
        cleaned = re.sub(pattern, "[redacted]", cleaned, flags=re.IGNORECASE)
    return cleaned


def classify_risk(text: str) -> RiskLevel:
    """How much harm could a wrong answer to this do?"""
    if _matches(text, CLINICAL_DIRECTIVE_PATTERNS) or _matches(text, PHI_PATTERNS):
        return RiskLevel.HIGH
    for pattern in ELEVATED_TOPIC_PATTERNS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            return RiskLevel.MEDIUM
    if text.strip():
        return RiskLevel.LOW
    return RiskLevel.NONE


def screen_message(text: str) -> SafetyVerdict:
    """Rules 1 and 2. Run before anything is sent to a model."""
    phi = _matches(text, PHI_PATTERNS)
    clinical = _matches(text, CLINICAL_DIRECTIVE_PATTERNS)
    risk = classify_risk(text)

    if phi:
        return SafetyVerdict(
            allowed=False,
            risk_level=RiskLevel.HIGH,
            reasons=phi,
            redacted_text=redact(text),
            refusal_message=(
                "That message looks like it contains patient identifiers, so I have not "
                "processed it. Identifiable data must never be sent to an AI service. "
                "Rewrite the question with the details removed and I will help."
            ),
        )

    if clinical:
        return SafetyVerdict(
            allowed=False,
            risk_level=RiskLevel.HIGH,
            reasons=clinical,
            redacted_text=redact(text),
            refusal_message=(
                "I'm Medly AI, an educational assistant — I can't diagnose, treat or make "
                "a care decision for a real patient. Please have a qualified clinician "
                "evaluate this person directly. I can still teach the underlying concept: "
                "the differential diagnosis approach, the pathophysiology, or how a "
                "clinician would reason through a case like this. Ask me that and I will "
                "explain it."
            ),
        )

    return SafetyVerdict(
        allowed=True,
        risk_level=risk,
        reasons=[],
        redacted_text=redact(text),
    )


# The caveat that goes under every AI answer, authored per locale. Ending a
# Russian answer with an English disclaimer would undo the localisation in the
# last line of every single response.
#
# `settings.disclaimer` remains the English text and remains configurable; a
# deployment that overrides it gets its own wording in English and the
# authored translations elsewhere, which is the honest behaviour — this module
# cannot translate an arbitrary operator-supplied string on the hot path.
_DISCLAIMER_BY_LANG = {
    "ru": "Это учебный материал, а не медицинская рекомендация.",
    "uz": "Bu oʻquv materiali, tibbiy maslahat emas.",
}
_VERIFY_BY_LANG = {
    "en": "**Verify before you rely on this.**",
    "ru": "**Проверьте, прежде чем полагаться на это.**",
    "uz": "**Bunga tayanishdan oldin tekshiring.**",
}


def disclaimer_for(lang: str) -> str:
    return _DISCLAIMER_BY_LANG.get(lang, settings.disclaimer)


def apply_disclaimer(answer: str, risk: RiskLevel, lang: str = "en") -> str:
    """Rule 3. Every output carries a caveat; higher risk gets a louder one."""
    text = disclaimer_for(lang)
    if risk in (RiskLevel.HIGH, RiskLevel.MEDIUM):
        return f"{answer}\n\n---\n{_VERIFY_BY_LANG.get(lang, _VERIFY_BY_LANG['en'])} {text}"
    return f"{answer}\n\n---\n_{text}_"


def evaluate_confidence(confidences: List[float]) -> Tuple[float, bool, bool]:
    """Rule 4. Returns (mean confidence, uncertain, needs human review).

    A model that is unsure must say so. Anything under the configured threshold
    is flagged, and is routed to an instructor rather than shown as a result.
    """
    if not confidences:
        return 0.0, True, True
    mean = sum(confidences) / len(confidences)
    lowest = min(confidences)
    uncertain = lowest < settings.low_confidence_threshold
    needs_review = mean < settings.low_confidence_threshold
    return round(mean, 4), uncertain, needs_review


# --------------------------------------------------------------------------
# The standard, published so the frontend can render it and judges can read it.
# --------------------------------------------------------------------------

SAFETY_STANDARD = [
    {
        "id": "S1",
        "title": "Scope limitation",
        "rule": "AI assistance is for education. It must never issue a diagnosis, "
                "a treatment plan or a dose for a real patient.",
        "enforced_by": "safety.screen_message - clinical directives are refused",
    },
    {
        "id": "S2",
        "title": "No identifiable data",
        "rule": "Patient identifiers must never be transmitted to a model. "
                "Suspected identifiers are refused and redacted before storage.",
        "enforced_by": "safety.screen_message + safety.redact",
    },
    {
        "id": "S3",
        "title": "Mandatory disclosure",
        "rule": "Every AI output is labelled as AI-generated and carries a "
                "limitations notice. There is no setting that turns this off.",
        "enforced_by": "safety.apply_disclaimer - applied in the service layer",
    },
    {
        "id": "S4",
        "title": "Calibrated confidence",
        "rule": "Model confidence is always shown. Output below the confidence "
                "threshold is flagged as uncertain and escalated for review.",
        "enforced_by": "safety.evaluate_confidence + AnalysisJob.requires_review",
    },
    {
        "id": "S5",
        "title": "Human accountability",
        "rule": "A named human records their own read before the model is "
                "revealed, and every interaction is written to an audit log.",
        "enforced_by": "AnalysisJob.student_finding + the audit_events table",
    },
    {
        "id": "S6",
        "title": "Order of reading",
        "rule": "The model runs only after the student has recorded their own "
                "interpretation. Seeing the AI first is impossible, not discouraged.",
        "enforced_by": "analysis.analyze — HTTP 409 without a prior reading",
    },
]
