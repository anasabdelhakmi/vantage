"""
TRIAGE TOOL  --  "the nurse"

Job: given a patient's symptoms, keep a running "best guess" of what the
illness might be (a probability for each possible condition), and decide the
single most useful next question to ask.

This is deliberately SIMPLE (transparent rules), not a black box. That's a
feature: at a hackathon you want to be able to explain exactly why it said
what it said. You can make it smarter later without changing anything else.

The agent (Kimi) calls run_triage(...) as a tool. It does NOT diagnose on its
own -- it just orchestrates this function.
"""

from dataclasses import dataclass, field
from typing import Dict, List


# A tiny "knowledge base": which symptoms point at which conditions.
# weight = how strongly this symptom suggests this condition.
SYMPTOM_WEIGHTS: Dict[str, Dict[str, float]] = {
    "dengue":        {"fever": 1.0, "headache": 0.8, "body_aches": 1.0,
                      "rash": 1.5, "bleeding_gums": 2.0, "eye_pain": 1.2},
    "flu":           {"fever": 1.0, "headache": 0.7, "body_aches": 0.9,
                      "cough": 1.5, "sore_throat": 1.3, "runny_nose": 1.2},
    "malaria":       {"fever": 1.2, "chills": 1.8, "sweating": 1.5,
                      "headache": 0.6, "body_aches": 0.5},
    "gastro":        {"fever": 0.4, "diarrhea": 2.0, "vomiting": 1.6,
                      "stomach_pain": 1.4},
}

# For each condition, the most informative follow-up symptoms to ask about.
FOLLOW_UP_QUESTIONS: Dict[str, str] = {
    "rash":          "Is there any skin rash?",
    "bleeding_gums": "Any bleeding from the gums or nose?",
    "eye_pain":      "Any pain behind the eyes?",
    "cough":         "Is there a cough?",
    "sore_throat":   "Is the throat sore?",
    "chills":        "Are there strong chills or shivering?",
    "sweating":      "Are there heavy sweats?",
    "diarrhea":      "Is there diarrhea?",
    "vomiting":      "Is there vomiting?",
    "stomach_pain":  "Any stomach pain?",
    "runny_nose":    "Is the nose runny or blocked?",
}

ALL_CONDITIONS = list(SYMPTOM_WEIGHTS.keys())


@dataclass
class TriageResult:
    beliefs: Dict[str, float]          # e.g. {"dengue": 0.62, "flu": 0.25, ...}
    top_condition: str                 # the current leading guess
    top_probability: float             # how strong that guess is (0..1)
    next_question: str                 # best question to ask next ("" if confident)
    known_symptoms: List[str] = field(default_factory=list)


def _score(symptoms: List[str]) -> Dict[str, float]:
    """Turn a list of symptoms into a probability for each condition."""
    raw = {}
    for cond, weights in SYMPTOM_WEIGHTS.items():
        raw[cond] = sum(weights.get(s, 0.0) for s in symptoms)

    total = sum(raw.values())
    if total == 0:
        # No recognized symptoms yet -> everything equally likely.
        n = len(ALL_CONDITIONS)
        return {c: 1.0 / n for c in ALL_CONDITIONS}
    return {c: v / total for c, v in raw.items()}


def _best_next_question(symptoms: List[str], beliefs: Dict[str, float]) -> str:
    """
    Pick the follow-up question that would best separate the leading
    conditions -- i.e. a symptom we haven't asked about yet that strongly
    distinguishes the current top guesses.
    """
    asked = set(symptoms)
    # Look at the two leading conditions and find a discriminating symptom.
    ranked = sorted(beliefs, key=beliefs.get, reverse=True)
    for cond in ranked:
        for symptom, weight in sorted(
            SYMPTOM_WEIGHTS[cond].items(), key=lambda kv: kv[1], reverse=True
        ):
            if symptom not in asked and symptom in FOLLOW_UP_QUESTIONS:
                return FOLLOW_UP_QUESTIONS[symptom]
    return ""


def run_triage(symptoms: List[str], confidence_target: float = 0.65) -> TriageResult:
    """
    Main entry point the agent calls.

    symptoms: list like ["fever", "headache", "body_aches"]
    confidence_target: stop asking once the top guess passes this.

    Returns a TriageResult. If next_question is "" the tool is confident enough.
    """
    symptoms = [s.strip().lower().replace(" ", "_") for s in symptoms if s.strip()]
    beliefs = _score(symptoms)
    top = max(beliefs, key=beliefs.get)
    top_p = beliefs[top]

    next_q = "" if top_p >= confidence_target else _best_next_question(symptoms, beliefs)

    return TriageResult(
        beliefs=beliefs,
        top_condition=top,
        top_probability=round(top_p, 2),
        next_question=next_q,
        known_symptoms=symptoms,
    )


if __name__ == "__main__":
    # quick manual check
    r = run_triage(["fever", "headache", "body_aches"])
    print("Beliefs:", {k: round(v, 2) for k, v in r.beliefs.items()})
    print("Top guess:", r.top_condition, r.top_probability)
    print("Next question:", r.next_question or "(confident enough)")
