# Vantage — clinic triage + restock copilot

> Hackathon 2026 project. An AI copilot for rural clinics with **no doctor on
> site**. Built on five sponsor tools: **Kimi AI, Oxylabs, Nosana, Doubleword,
> Datona.**

This README is the single source of truth for the whole team. It's written so
that **any teammate — and any coding assistant (Claude Code, Cursor, Kimi Code,
etc.) — can read it and have full context.** If you also use an AI coding agent,
point it at `AGENTS.md` (it references this file).

---

## Table of contents

1. [What we're building](#1-what-were-building)
2. [Why it matters](#2-why-it-matters)
3. [How it works (architecture)](#3-how-it-works-architecture)
4. [Run it right now (no keys)](#4-run-it-right-now-no-keys)
5. [Project layout — who owns what](#5-project-layout--who-owns-what)
6. [The one idea that makes integration easy](#6-the-one-idea-that-makes-integration-easy)
7. [Turning on each sponsor service](#7-turning-on-each-sponsor-service)
8. [How the team works together](#8-how-the-team-works-together)
9. [Coding conventions (for humans and LLMs)](#9-coding-conventions-for-humans-and-llms)
10. [Build roadmap](#10-build-roadmap)
11. [How this maps to the judging criteria](#11-how-this-maps-to-the-judging-criteria)
12. [Open questions](#12-open-questions)

---

## 1. What we're building

Two tools inside one conversational app:

1. **Triage** — a community health worker types a patient's symptoms. The app
   asks smart follow-up questions, suggests the most likely condition, and —
   when it's unsure or sees a danger sign — **routes to a remote doctor instead
   of guessing.** That "know when to stop and escalate" behaviour is the whole
   safety point.
2. **Restock** — the app reads outbreak and weather signals and recommends
   ordering the right medicines **ahead** of an outbreak, instead of reordering
   only from last month's sales (which is always too late).

## 2. Why it matters

We're in Singapore, surrounded by countries where rural clinics serve large
populations with thin specialist coverage and seasonal outbreak risk (dengue,
flu, monsoon-driven disease). Two failure modes compound there:

- Triage tools trained on **urban hospital data misfire silently** on unfamiliar
  rural cases — and being confidently wrong is dangerous.
- Medicine restocking runs on **backward-looking demand**, so clinics stock out
  right when an outbreak hits, or over-order and waste supplies.

Vantage treats both as the same kind of problem: **make a sequential decision
under uncertainty, and stay safe when the model is wrong.**

## 3. How it works (architecture)

Think of it as a tiny clinic team, where each app is one "staff member":

```
             Health worker's phone/app
                        |
                        v
        ┌───────────────────────────────┐
        │  Kimi K3  — the coordinator    │  <- the only part the worker talks to
        │  decides which tool to call    │
        └───────────────────────────────┘
           |            |             |
           v            v             v
      ┌─────────┐  ┌──────────┐  ┌──────────────┐
      │ Triage  │  │ Restock  │  │ Escalation   │
      │  tool   │  │  tool    │  │  check       │
      │ (nurse) │  │ (supply) │  │ (safety)     │
      └─────────┘  └──────────┘  └──────────────┘
                        ^
                        |  outbreak + weather signals
                  ┌──────────────┐
                  │   Oxylabs    │
                  └──────────────┘

  Runs on:  Nosana (hosts the AI model)   Datona (consent-controlled records)
  Tested by: Doubleword (offline bulk exam over thousands of fake patients)
```

Plain-English roles:

- **Kimi = coordinator.** Talks to the worker, picks which tool to call, relays
  results in plain language. Doesn't diagnose or count medicines itself.
- **Triage tool = the nurse.** Keeps a running "best guess" of the illness and
  picks the single most useful next question.
- **Escalation check = the safety officer.** Decides when to stop guessing and
  route to a doctor (danger signs, unfamiliar symptoms, or a too-weak guess with
  no useful question left).
- **Restock tool = the supply manager.** Turns outbreak forecasts into medicine
  reorder amounts. Nothing to do with the patient in the chat.
- **Oxylabs = the runner** who fetches outside news (outbreak, weather).
- **Nosana = the building** the AI model runs in (rented GPU instead of big
  cloud).
- **Datona = the locked filing cabinet** for patient records + consent.
- **Doubleword = the exam** you pass before the demo — runs thousands of fake
  patients through the triage tool to prove it escalates when it should.
  **Offline; never part of a live patient chat.**

## 4. Run it right now (no keys)

The app runs offline in **mock mode** using a built-in fake brain, so anyone can
see it work in under a minute — no accounts, no API keys, no `pip install`.

```bash
cd vantage
python main.py
```

Try typing:

| You type | What it demonstrates |
|---|---|
| `fever, headache and body aches` | asks a smart follow-up question |
| `fever and a rash and bleeding gums` | escalates to a doctor (danger sign) |
| `cough and sore throat and runny nose` | confident assessment |
| `what should we reorder this month?` | forecast-adjusted restock list |

Run the safety exam over many fake patients:

```bash
python tests/make_test_batch.py     # prints a safety score, writes the JSONL batch
```

## 5. Project layout — who owns what

| File | Plain-English job | "Staff member" | Suggested owner |
|---|---|---|---|
| `main.py` | The terminal chat you type into | front desk | — |
| `agent.py` | Picks which tool to call, replies in plain language | **Kimi** coordinator | Person A |
| `tools/triage.py` | Best-guess of the illness + next question | the nurse | Person A |
| `tools/escalation.py` | When to stop guessing and call a doctor | safety officer | Person A |
| `tools/restock.py` | Medicine reorder amounts | supply manager | Person B |
| `signals/oxylabs.py` | Fetches outbreak/weather news | **Oxylabs** runner | Person B |
| `tests/make_test_batch.py` | Offline exam over fake patients | **Doubleword** | Person C |
| `config.py` | All keys + service URLs in one place | settings drawer | shared |
| `.env.example` | Template for secrets (copy to `.env`) | — | shared |

Everything routes through `agent.py`. The tools are **plain Python functions** —
start simple, make them smarter later without touching anything else.

## 6. The one idea that makes integration easy

**Kimi, Nosana, and Doubleword all speak the same "OpenAI" API language.** The
same few lines talk to all three — you only swap the URL and key:

```python
from openai import OpenAI
client = OpenAI(api_key=KEY, base_url=BASE_URL)   # swap these two, nothing else
client.chat.completions.create(model=MODEL, messages=[...])
```

So learn it once and 3 of the 5 sponsors work the same way. `config.py` already
centralizes the URLs/keys, and `config.active_llm()` auto-picks mock / Kimi /
Nosana based on what's set.

## 7. Turning on each sponsor service

Install deps first (not needed for mock mode):

```bash
pip install -r requirements.txt
cp .env.example .env      # then fill in whichever keys you have
```

**1. Kimi (the brain).** Key from <https://platform.moonshot.ai>.
```bash
export KIMI_API_KEY=sk-...
python main.py            # now uses real LLM tool-calling
```

**2. Oxylabs (outbreak signals).** Set credentials, then implement the page
parsing in `signals/oxylabs.py → _fetch_real` (there's a clear `TODO`).
```bash
export OXYLABS_USERNAME=...   export OXYLABS_PASSWORD=...
```

**3. Nosana (host the model).** Deploy a model at <https://deploy.nosana.com>,
copy the endpoint URL, then:
```bash
export NOSANA_BASE_URL=https://<your-id>.node.k8s.prod.nos.ci/v1
python main.py            # same app, now on decentralized GPU
```

**4. Doubleword (bulk testing).** Key, then batch submission is automatic:
```bash
export DOUBLEWORD_API_KEY=...
python tests/make_test_batch.py
```

**5. Datona (consent layer).** Confirm the exact product with the organizers,
then store/guard patient records through it. Until then, records live in memory.

**Optional — web UI.** Fastest is Streamlit: a one-file `app.py` calling
`agent.ask(msg)`, run with `streamlit run app.py`. Not built yet — see roadmap.

## 8. How the team works together

- **Branches.** One branch per feature: `feat/oxylabs-real`, `feat/streamlit-ui`,
  etc. Open a pull request into `main`; don't push straight to `main`.
- **Keep mock mode working.** Every change must still run with **no keys**
  (`python main.py`). That's how teammates and judges run it. If you add a real
  API call, always keep a mock fallback (see `signals/oxylabs.py` for the
  pattern).
- **Secrets.** Never commit keys. Put them in `.env` (git-ignored) or export
  them. `.env.example` documents what exists.
- **Run the safety test before every PR:** `python tests/make_test_batch.py`
  should report full marks (or you fixed a case on purpose — say so in the PR).

## 9. Coding conventions (for humans and LLMs)

Because we're using **different LLM coding assistants**, consistency matters.
These rules keep everyone's output compatible:

- **Python 3.10+**, standard library only in mock paths. Third-party imports
  (`openai`, `requests`) go **inside** the function that uses them, so mock mode
  never needs them installed. (See `signals/oxylabs.py`.)
- **Each tool is a plain function** returning a dataclass or plain dict. No
  hidden global state.
- **The agent never diagnoses directly** — it only orchestrates tools. Keep
  medical/decision logic inside `tools/`, not in `agent.py`.
- **Tool schemas live in `agent.py → TOOL_SCHEMAS`.** If you add a tool: (1)
  write the function in `tools/`, (2) add its JSON schema, (3) add it to
  `TOOL_IMPLEMENTATIONS`, (4) handle it in `_run_mock` so offline mode still
  works.
- **Config only in `config.py`.** No hard-coded URLs or keys anywhere else.
- **Comment for a beginner.** Assume the next reader is new to this — every file
  starts with a plain-English docstring saying what it is.

## 10. Build roadmap

1. Run mock mode, read `agent.py` — understand the loop. ✅ (done, works)
2. Flip on real Kimi.
3. Make Oxylabs signals real.
4. Add a Streamlit web UI.
5. Move to Nosana + run the Doubleword batch + wire Datona.

Steps 1–2 already give a working demo; the rest is polish and sponsor coverage.

## 11. How this maps to the judging criteria

- **Completeness** — full loop: signal in → adaptive decision → explicit
  escalation → forecast-adjusted restock.
- **Innovation** — applies forward-looking-signal + robust-decision ideas to
  frontline healthcare, not another retrieval chatbot.
- **Real-world fit** — built for Singapore's actual neighbourhood: cross-border
  supply, thin specialist coverage, seasonal outbreaks.
- **Sponsor usage** — every sponsor is on the critical path (orchestration, live
  signals, compute, batch validation, consent), not bolted on.

## 12. Open questions

- **Datona:** confirm exactly what product/API it provides at this hackathon
  before building around it.
- **Triage knowledge base:** the current symptom→condition weights in
  `tools/triage.py` are a hand-built starter. Decide whether to expand them,
  or replace with an LLM-based assessor validated via Doubleword.
- **Regions:** the outbreak signals are per-region; decide which specific
  countries/provinces to target for the demo.
