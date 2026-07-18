# Vantage — clinic triage + restock copilot

> Hackathon 2026 project. An AI copilot for rural clinics with **no doctor on
> site**. Built on sponsor tools: **ai&, Oxylabs, Daytona, Nosana, Kimi AI**
> (any OpenAI-compatible model can drive it).

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
        │  AI coordinator                │  <- the only part the worker talks to
        │  (ai& / OpenAI / Kimi / Nosana)│     decides which tool to call
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
                  │   Oxylabs    │  Web Scraper API + Residential Proxy
                  └──────────────┘

  Runs on:  Nosana (optional GPU host)   Daytona (secure sandbox)
  Tested by: ai& (offline bulk exam over many fake patients)
```

Plain-English roles:

- **Coordinator (the brain) = the doctor's front desk.** Talks to the worker,
  picks which tool to call, relays results in plain language. Doesn't diagnose or
  count medicines itself. Any OpenAI-compatible model runs it — **ai&** (current
  default), OpenAI, Kimi, or a Nosana-hosted model — selected via `LLM_PROVIDER`.
- **Triage tool = the nurse.** Keeps a running "best guess" of the illness and
  picks the single most useful next question.
- **Escalation check = the safety officer.** Decides when to stop guessing and
  route to a doctor (danger signs, unfamiliar symptoms, or a too-weak guess with
  no useful question left).
- **Restock tool = the supply manager.** Turns outbreak forecasts into medicine
  reorder amounts. Nothing to do with the patient in the chat.
- **Oxylabs = the runner** who fetches outside news (outbreak, weather). Two
  products: the **Web Scraper API** (renders JavaScript → official WHO/MoH pages)
  and the **Residential Proxy** (fast raw HTML → news RSS feeds). The active brain
  then extracts structured outbreak signals from what it fetches.
- **Nosana = the building** the AI model can run in (rented GPU instead of big
  cloud). Optional — the app runs on any brain.
- **Daytona = the locked room** — a secure sandbox to run agent code in isolation
  (`sandbox/daytona.py`). *(The original "Datona" consent-record product is still
  undefined — see Open questions.)*
- **ai& = the exam** you pass before the demo — runs many fake patients through
  the triage tool via structured tool-calling to prove it escalates when it
  should. **Offline; never part of a live patient chat.** (ai& also doubles as
  the default coordinator brain.)

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

**Live vs mock outbreak signals.** With keys set, the restock tool pulls real
outbreak news through Oxylabs and extracts signals with the LLM (a few seconds).
Flip it off for an instant, deterministic demo:

```bash
USE_LIVE_SIGNALS=false python main.py   # instant mock signals
USE_LIVE_SIGNALS=true  python main.py   # live Oxylabs → forecast-adjusted restock
```

The banner shows which mode you're in. Pick the brain with `LLM_PROVIDER`
(`aiand` | `openai` | `kimi` | `nosana` | `mock`; blank = auto-detect).

## 5. Project layout — who owns what

| File | Plain-English job | "Staff member" | Suggested owner |
|---|---|---|---|
| `main.py` | The terminal chat you type into | front desk | — |
| `agent.py` | Picks which tool to call, replies in plain language | coordinator (any brain) | Person A |
| `tools/triage.py` | Best-guess of the illness + next question | the nurse | Person A |
| `tools/escalation.py` | When to stop guessing and call a doctor | safety officer | Person A |
| `tools/restock.py` | Medicine reorder amounts | supply manager | Person B |
| `signals/oxylabs.py` | Fetches + extracts outbreak/weather signals | **Oxylabs** runner | Person B |
| `sandbox/daytona.py` | Secure sandbox to run agent code | **Daytona** | Person B |
| `tests/make_test_batch.py` | Offline safety exam over fake patients | **ai&** | Person C |
| `config.py` | All keys, brains + service URLs in one place | settings drawer | shared |
| `.env.example` | Template for secrets (copy to `.env`) | — | shared |

Everything routes through `agent.py`. The tools are **plain Python functions** —
start simple, make them smarter later without touching anything else.

## 6. The one idea that makes integration easy

**ai&, OpenAI, Kimi, and Nosana all speak the same "OpenAI" API language.** The
same few lines talk to all of them — you only swap the URL and key:

```python
from openai import OpenAI
client = OpenAI(api_key=KEY, base_url=BASE_URL)   # swap these two, nothing else
client.chat.completions.create(model=MODEL, messages=[...])
```

So learn it once and the coordinator works on any of them. `config.py`
centralizes the URLs/keys, and `config.active_llm()` picks the brain from
`LLM_PROVIDER` (or auto-detects from whatever key is set), falling back to a
built-in mock brain when nothing is configured.

## 7. Turning on each sponsor service

Install deps first (not needed for mock mode):

```bash
pip install -r requirements.txt
cp .env.example .env      # then fill in whichever keys you have
```

**1. The brain (ai& / OpenAI / Kimi / Nosana).** All OpenAI-compatible — set a
key and pick it with `LLM_PROVIDER`. **ai&** is the current default.
```bash
export AIAND_API_KEY=sk-...      # ai& (https://docs.aiand.com)
export LLM_PROVIDER=aiand        # or: openai | kimi | nosana | mock
python main.py                   # real LLM tool-calling
```
Others: `OPENAI_API_KEY` (`OPENAI_MODEL=gpt-4o`), `KIMI_API_KEY`
(`KIMI_MODEL=kimi-k3`; **kimi-k2 was discontinued**), or `NOSANA_BASE_URL` to
run an open model on decentralized GPU (<https://deploy.nosana.com>).

**2. Oxylabs (outbreak signals).** Two products, each used where it's strong. The
active brain then extracts structured signals from what's fetched
(`signals/oxylabs.py`). Set **either** — the app prefers the proxy for news RSS
and the Web Scraper API for JS-heavy official pages:
```bash
# Web Scraper API — JS rendering, official sources (WHO/MoH)
export OXYLABS_SCRAPER_USERNAME=...   export OXYLABS_SCRAPER_PASSWORD=...
# Residential Proxy — fast raw HTML, news RSS. Country is in the username.
export OXYLABS_USERNAME=customer-<user>-cc-US   export OXYLABS_PASSWORD=...
export OXYLABS_PROXY=pr.oxylabs.io:7777         # optional; default
```
Toggle live fetching with `USE_LIVE_SIGNALS=true|false`; edit `NEWS_FEEDS` /
`OFFICIAL_SOURCES` in `signals/oxylabs.py` to retarget regions.

**3. ai& (safety testing).** Structured tool-calling gives a reliable escalate
flag — the test script runs each patient through ai& automatically:
```bash
export AIAND_API_KEY=sk-...
python tests/make_test_batch.py
```

**4. Daytona (secure sandbox).** Create a key in the Daytona dashboard, then the
sandbox helper (`sandbox/daytona.py`) runs agent code in isolation, with a local
mock fallback when unset:
```bash
export DAYTONA_API_KEY=dtn_...
```

**Web UI.** Built and dependency-free — `app.py` is a tiny standard-library
web server that wraps `agent.ask(msg)` plus the outbreak signals, so it runs
with no `pip install`, same as mock mode:

```bash
python app.py            # then open http://localhost:8000
PORT=9000 python app.py  # pick another port
```

It's a clean, light, blue single page with four parts: a **Copilot** chat
(triage + restock, red-flagged escalations); a **focus-area map** of our
South-East-Asian deployment countries — **click a country to select it** (it
highlights, no popups); an **Outbreak signals** panel that lists the selected
country first, then its neighbours, with each disease's forward-looking demand
multiplier; and a **Field Guide** — educational disease notes (dengue, malaria,
gastro/cholera, flu) for those areas. Retarget the map, signals, and guide by
editing the single `FOCUS` list at the top of `app.py`.

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

1. Run mock mode, read `agent.py` — understand the loop. ✅
2. Real LLM tool-calling brain (multi-provider, default ai&). ✅
3. Real Oxylabs signals — Web Scraper API + Residential Proxy + LLM extraction. ✅
4. ai& safety test via structured tool-calling (8/8). ✅
5. Daytona sandbox wired (`sandbox/daytona.py`). ✅
6. Web UI — dependency-free `app.py` (copilot chat + signals + focus map + Field Guide). ✅
7. Optional: deploy a model on Nosana; confirm the "Datona" consent product. ⬜

The full loop works end-to-end today; remaining items are polish and coverage.

## 11. How this maps to the judging criteria

- **Completeness** — full loop: signal in → adaptive decision → explicit
  escalation → forecast-adjusted restock.
- **Innovation** — applies forward-looking-signal + robust-decision ideas to
  frontline healthcare, not another retrieval chatbot.
- **Real-world fit** — built for Singapore's actual neighbourhood: cross-border
  supply, thin specialist coverage, seasonal outbreaks.
- **Sponsor usage** — every sponsor is on the critical path (orchestration by the
  brain, live signals via Oxylabs, safety validation via ai&, isolation via
  Daytona, optional compute via Nosana), not bolted on.

## 12. Open questions

- **Datona vs Daytona:** we wired **Daytona** as a secure code sandbox
  (`sandbox/daytona.py`). The originally-planned "Datona" consent-record product
  is still undefined — confirm what it actually provides before building on it.
- **Triage knowledge base:** the current symptom→condition weights in
  `tools/triage.py` are a hand-built starter. Decide whether to expand them,
  or replace with an LLM-based assessor validated via ai&.
- **Regions:** the outbreak signals are per-region; decide which specific
  countries/provinces to target for the demo.
