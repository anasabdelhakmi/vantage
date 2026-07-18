"""
ESCALATION CHECK  --  "the safety officer"

Job: BEFORE the triage tool gives a confident answer, decide whether we
should trust it at all. If the case looks unfamiliar or the guess is weak,
we stop guessing and route to a remote doctor.

This is the heart of the "robustness" idea in the pitch: being confidently
wrong is the dangerous failure mode, so the system is designed to hand off
rather than extrapolate into territory it doesn't understand.
"""

from dataclasses import dataclass
from typing import Dict, List

from tools.triage import TriageResult, ALL_CONDITIONS


@dataclass
class EscalationDecision:
    escalate: bool
    reason: str


# Symptoms the system "knows about". Anything outside this vocabulary is a
# sign we're seeing something our simple model was never built for.
KNOWN_VOCAB = {
    "fever", "headache", "body_aches", "rash", "bleeding_gums", "eye_pain",
    "cough", "sore_throat", "runny_nose", "chills", "sweating",
    "diarrhea", "vomiting", "stomach_pain",
}

# Red-flag symptoms that always warrant a doctor, regardless of the guess.
RED_FLAGS = {"bleeding_gums", "chest_pain", "difficulty_breathing",
             "unconscious", "seizure", "severe_bleeding"}


def check_escalation(
    result: TriageResult,
    reported_symptoms: List[str],
    min_confidence: float = 0.5,
    more_questions_available: bool = False,
) -> EscalationDecision:
    """
    Decide whether to escalate to a remote doctor.

    Reasons we escalate (in priority order):
      1. A red-flag symptom is present  -> always, immediately.
      2. Symptoms outside what our model knows (out-of-distribution)
         -> we shouldn't trust any confident answer.
      3. The leading guess is too weak to act on AND there are no more
         useful questions left to ask. (If a helpful follow-up question is
         still available, we ask it rather than escalate — that's the
         adaptive "ask smart questions" behaviour.)
    """
    symptoms = {s.strip().lower().replace(" ", "_") for s in reported_symptoms}

    # 1. Red flags -> always escalate.
    red = symptoms & RED_FLAGS
    if red:
        return EscalationDecision(
            True, f"Red-flag symptom present ({', '.join(sorted(red))}) — needs a doctor.")

    # 2. Unknown symptoms -> out of distribution.
    unknown = symptoms - KNOWN_VOCAB
    if unknown:
        return EscalationDecision(
            True,
            f"Symptoms outside what this tool was built for ({', '.join(sorted(unknown))}) "
            f"— escalating instead of guessing.")

    # 3. Weak top guess AND nothing left to ask -> escalate.
    if result.top_probability < min_confidence and not more_questions_available:
        return EscalationDecision(
            True,
            f"Leading guess ({result.top_condition}, {result.top_probability:.0%}) "
            f"is too uncertain and no further question would help — escalating.")

    return EscalationDecision(False, "Confident or still gathering info — safe to continue.")
