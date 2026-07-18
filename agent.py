"""
THE AGENT  --  "the coordinator" (Kimi)

This is the brain that talks to the health worker. It doesn't diagnose or
count medicines itself -- it decides WHICH tool to call and relays the result
in plain language.

It runs in two modes automatically (see config.active_llm):
  * MOCK MODE  (default, no API key): a small built-in rule-based brain
    simulates the decisions so the whole app runs offline today.
  * REAL MODE  (Kimi or Nosana key set): uses genuine LLM tool-calling.

The tool *definitions* below are the same JSON schema both modes use, so when
you flip to real Kimi nothing else in the project changes.
"""

import json
from typing import Dict, List

import config
from tools.triage import run_triage
from tools.restock import run_restock
from tools.escalation import check_escalation


# ---------------------------------------------------------------------------
# 1. Tool definitions -- how we describe our Python functions to the LLM.
#    (OpenAI / Kimi "tools" format.)
# ---------------------------------------------------------------------------
TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "run_triage",
            "description": "Assess a patient from their symptoms. Returns the "
                           "leading condition, a confidence, and the best next "
                           "question to ask (empty if confident enough).",
            "parameters": {
                "type": "object",
                "properties": {
                    "symptoms": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Symptoms mentioned, e.g. ['fever','headache']",
                    }
                },
                "required": ["symptoms"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_restock",
            "description": "Recommend medicine reorder quantities for the clinic, "
                           "adjusted for current outbreak forecasts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "current_stock": {
                        "type": "object",
                        "description": "Optional map of medicine -> units on hand",
                    }
                },
                "required": [],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# 2. The actual Python behind each tool name, plus the safety wrapper.
# ---------------------------------------------------------------------------
def _do_triage(symptoms: List[str]) -> Dict:
    result = run_triage(symptoms)
    safety = check_escalation(
        result, symptoms,
        more_questions_available=bool(result.next_question),
    )
    return {
        "top_condition": result.top_condition,
        "confidence": result.top_probability,
        "next_question": result.next_question,
        "escalate": safety.escalate,
        "escalation_reason": safety.reason,
        "beliefs": {k: round(v, 2) for k, v in result.beliefs.items()},
    }


def _do_restock(current_stock: Dict = None) -> Dict:
    lines = run_restock(current_stock or {})
    return {
        "orders": [
            {"medicine": l.medicine, "order": l.recommended_order,
             "multiplier": l.multiplier, "reason": l.reason}
            for l in lines
        ]
    }


TOOL_IMPLEMENTATIONS = {
    "run_triage": lambda args: _do_triage(args.get("symptoms", [])),
    "run_restock": lambda args: _do_restock(args.get("current_stock", {})),
}


SYSTEM_PROMPT = (
    "You are Vantage, an assistant for a community health worker in a rural "
    "clinic with no doctor on site. Use the run_triage tool for patient "
    "symptoms and run_restock for medicine supply questions. If a triage "
    "result has escalate=true, tell the worker to connect to a remote doctor "
    "and do NOT give a confident diagnosis. Keep replies short and practical."
)


# ---------------------------------------------------------------------------
# 3a. REAL brain: genuine LLM tool-calling loop (Kimi or Nosana).
# ---------------------------------------------------------------------------
def _run_real(user_message: str, base_url: str, api_key: str, model: str) -> str:
    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url=base_url)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    # Loop: let the model call tools until it produces a final answer.
    for _ in range(6):  # safety cap on tool rounds
        resp = client.chat.completions.create(
            model=model, messages=messages, tools=TOOL_SCHEMAS,
        )
        msg = resp.choices[0].message
        messages.append(msg.model_dump())      # keep FULL assistant message

        if not msg.tool_calls:
            return msg.content or ""

        for call in msg.tool_calls:
            args = json.loads(call.function.arguments or "{}")
            output = TOOL_IMPLEMENTATIONS[call.function.name](args)
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": json.dumps(output),
            })
    return "Stopped after too many tool calls."


# ---------------------------------------------------------------------------
# 3b. MOCK brain: mimics the same decisions with simple rules, no API needed.
# ---------------------------------------------------------------------------
_SYMPTOM_WORDS = {
    "fever", "headache", "body aches", "body_aches", "rash", "bleeding gums",
    "bleeding_gums", "eye pain", "eye_pain", "cough", "sore throat",
    "sore_throat", "runny nose", "chills", "sweating", "diarrhea",
    "vomiting", "stomach pain", "chest pain", "difficulty breathing",
}


def _extract_symptoms(text: str) -> List[str]:
    t = text.lower()
    found = []
    for w in _SYMPTOM_WORDS:
        if w in t:
            found.append(w.replace(" ", "_"))
    return sorted(set(found))


def _run_mock(user_message: str) -> str:
    text = user_message.lower()

    # Route: is this a supply question or a patient question?
    if any(k in text for k in ["stock", "reorder", "restock", "supply",
                               "medicine", "order", "inventory"]):
        out = _do_restock({})
        lines = ["[Restock recommendation — forecast-adjusted]"]
        for o in out["orders"]:
            lines.append(f"  • {o['medicine']}: order {o['order']}  ({o['reason']})")
        return "\n".join(lines)

    # Otherwise treat it as a triage case.
    symptoms = _extract_symptoms(user_message)
    if not symptoms:
        return ("Tell me the patient's symptoms (e.g. fever, headache, rash) "
                "and I'll assess them.")

    res = _do_triage(symptoms)
    if res["escalate"]:
        return (f"[SAFETY] {res['escalation_reason']}\n"
                f"→ Please connect this patient to a remote doctor. "
                f"I won't give a confident diagnosis here.")
    if res["next_question"]:
        return (f"Leading guess: {res['top_condition']} "
                f"({res['confidence']:.0%}). To be sure — {res['next_question']}")
    return (f"Assessment: likely {res['top_condition']} "
            f"({res['confidence']:.0%}). Monitor fluids and symptoms; "
            f"escalate if it worsens.")


# ---------------------------------------------------------------------------
# 4. Public entry point used by the CLI.
# ---------------------------------------------------------------------------
def ask(user_message: str) -> str:
    mode, base_url, api_key, model = config.active_llm()
    if mode == "mock":
        return _run_mock(user_message)
    return _run_real(user_message, base_url, api_key, model)


def current_mode() -> str:
    return config.active_llm()[0]
