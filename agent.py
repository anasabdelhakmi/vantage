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
    {
        "type": "function",
        "function": {
            "name": "run_calculation",
            "description": "Run a short Python snippet to compute a number or a "
                           "what-if projection (e.g. 'how many days until "
                           "paracetamol stocks out?'). Write plain Python that "
                           "print()s the answer. Runs in an isolated sandbox — "
                           "use this instead of doing arithmetic yourself.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {
                        "type": "string",
                        "description": "Python code that prints the result, e.g. "
                                       "print(round(200 / (200*1.9/30), 1))",
                    }
                },
                "required": ["code"],
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


def _do_calculation(code: str) -> Dict:
    """Run a Python snippet in an isolated Daytona sandbox and return its output.

    The coordinator (LLM) writes this code, so it is UNTRUSTED — running it in a
    disposable sandbox (sandbox/daytona.py) means it never touches the clinic's
    machine. Falls back to a local run when no Daytona key is set (demo only)."""
    from sandbox.daytona import run_python
    import config
    try:
        output = run_python(code)
        return {"ok": True, "stdout": (output or "").strip(),
                "sandboxed": config.daytona_enabled()}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


TOOL_IMPLEMENTATIONS = {
    "run_triage": lambda args: _do_triage(args.get("symptoms", [])),
    "run_restock": lambda args: _do_restock(args.get("current_stock", {})),
    "run_calculation": lambda args: _do_calculation(args.get("code", "")),
}


SYSTEM_PROMPT = (
    "You are Vantage, an assistant for a community health worker in a rural "
    "clinic with no doctor on site. Use the run_triage tool for patient "
    "symptoms and run_restock for medicine supply questions. If a triage "
    "result has escalate=true, tell the worker to connect to a remote doctor "
    "and do NOT give a confident diagnosis. For any arithmetic or what-if "
    "projection (e.g. how many days until a medicine stocks out), use the "
    "run_calculation tool — write a short Python snippet that prints the answer "
    "— instead of doing the maths yourself. Keep replies short and practical."
)


# ---------------------------------------------------------------------------
# 3a. REAL brain: genuine LLM tool-calling loop (Kimi or Nosana).
# ---------------------------------------------------------------------------
def _run_real(user_message: str, base_url: str, api_key: str, model: str):
    """Returns (reply_text, escalate). `escalate` is the AUTHORITATIVE flag from
    the escalation tool -- true if any triage call this turn wanted a doctor --
    NOT a guess from the reply text (which can mention 'doctor' when confident)."""
    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url=base_url)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    escalate = False
    # Loop: let the model call tools until it produces a final answer.
    for _ in range(6):  # safety cap on tool rounds
        resp = client.chat.completions.create(
            model=model, messages=messages, tools=TOOL_SCHEMAS,
        )
        msg = resp.choices[0].message
        messages.append(msg.model_dump())      # keep FULL assistant message

        if not msg.tool_calls:
            return (msg.content or "", escalate)

        for call in msg.tool_calls:
            args = json.loads(call.function.arguments or "{}")
            output = TOOL_IMPLEMENTATIONS[call.function.name](args)
            # Capture the real escalation decision from the triage tool.
            if call.function.name == "run_triage" and output.get("escalate"):
                escalate = True
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": json.dumps(output),
            })
    return ("Stopped after too many tool calls.", escalate)


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


def _run_mock(user_message: str):
    """Returns (reply_text, escalate) -- mirrors _run_real's contract."""
    text = user_message.lower()

    # Route: a what-if / stock-out projection -> run it in the Daytona sandbox.
    if any(k in text for k in ["stock out", "stockout", "run out", "how long",
                               "days until", "how many days", "project", "calculate"]):
        # The real brain writes this snippet itself; in mock mode we compute a
        # representative days-until-stockout to exercise the same sandbox path.
        out = _do_calculation(
            "on_hand = 200\n"
            "daily_use = 200 * 1.9 / 30   # baseline x dengue forecast\n"
            "print(round(on_hand / daily_use, 1))\n"
        )
        if out.get("ok"):
            where = "Daytona sandbox" if out.get("sandboxed") else "local sandbox"
            return (f"[Sandbox calc · {where}] At the current dengue-adjusted burn "
                    f"rate, paracetamol stocks out in ~{out['stdout']} days.", False)
        return (f"(sandbox calculation failed: {out.get('error')})", False)

    # Route: is this a supply question or a patient question?
    if any(k in text for k in ["stock", "reorder", "restock", "supply",
                               "medicine", "order", "inventory"]):
        out = _do_restock({})
        lines = ["[Restock recommendation — forecast-adjusted]"]
        for o in out["orders"]:
            lines.append(f"  • {o['medicine']}: order {o['order']}  ({o['reason']})")
        return ("\n".join(lines), False)

    # Otherwise treat it as a triage case.
    symptoms = _extract_symptoms(user_message)
    if not symptoms:
        return ("Tell me the patient's symptoms (e.g. fever, headache, rash) "
                "and I'll assess them.", False)

    res = _do_triage(symptoms)
    if res["escalate"]:
        return (f"[SAFETY] {res['escalation_reason']}\n"
                f"→ Please connect this patient to a remote doctor. "
                f"I won't give a confident diagnosis here.", True)
    if res["next_question"]:
        return (f"Leading guess: {res['top_condition']} "
                f"({res['confidence']:.0%}). To be sure — {res['next_question']}", False)
    return (f"Assessment: likely {res['top_condition']} "
            f"({res['confidence']:.0%}). Monitor fluids and symptoms; "
            f"escalate if it worsens.", False)


# ---------------------------------------------------------------------------
# 4. Public entry point used by the CLI.
# ---------------------------------------------------------------------------
def _ask(user_message: str):
    """Internal: returns (reply_text, escalate) for both brains."""
    mode, base_url, api_key, model = config.active_llm()
    if mode == "mock":
        return _run_mock(user_message)
    return _run_real(user_message, base_url, api_key, model)


def ask(user_message: str) -> str:
    """Plain-text reply — used by the CLI (main.py)."""
    return _ask(user_message)[0]


def ask_web(user_message: str) -> dict:
    """Reply plus the authoritative escalation flag — used by the web UI so it
    can show the 'connect to a doctor' button only on real escalations."""
    reply, escalate = _ask(user_message)
    return {"reply": reply, "escalate": escalate}


def current_mode() -> str:
    return config.active_llm()[0]
