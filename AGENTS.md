# AGENTS.md — context for AI coding assistants

This file gives AI coding tools (Claude Code, Cursor, Kimi Code, Copilot, etc.)
the context to work on this repo safely. **Read `README.md` first — it is the
full spec.** This file is the short version plus hard rules.

## What this project is

Vantage: an AI copilot for rural clinics. A **Kimi** agent (`agent.py`)
orchestrates three tools — triage, restock, escalation — fed by **Oxylabs**
signals, hosted on **Nosana**, tested by **Doubleword**, with **Datona** for
consent. See `README.md` §3 for the architecture.

## Golden rules (do not break these)

1. **Mock mode must always work.** The app has to run with `python main.py` and
   NO API keys and NO third-party packages installed. Never make an import at
   module top-level that mock mode doesn't need — import `openai`/`requests`
   *inside* the function that uses them. Every real API call needs a mock
   fallback.
2. **All config in `config.py`.** No hard-coded URLs, keys, or model names
   elsewhere. Read secrets from environment variables only.
3. **Never commit secrets.** Keys go in `.env` (git-ignored), documented in
   `.env.example`.
4. **The agent orchestrates; tools decide.** Keep medical/decision logic in
   `tools/`. `agent.py` should only route and format.
5. **Keep it explainable.** This is a hackathon judged partly on clarity. Prefer
   transparent, commented logic over cleverness. Start every file with a
   plain-English docstring.

## Adding a new tool (the checklist)

1. Write the function in `tools/<name>.py`, returning a dataclass or dict.
2. Add its JSON schema to `TOOL_SCHEMAS` in `agent.py`.
3. Register it in `TOOL_IMPLEMENTATIONS` in `agent.py`.
4. Handle it in `_run_mock()` so offline mode still responds.
5. Add a case to `tests/make_test_batch.py` if it affects safety.

## How to verify your change

```bash
python main.py                     # must start in MOCK mode with no keys
python tests/make_test_batch.py    # safety score should be full marks
python -m compileall -q .          # no syntax errors
```

## Tech facts worth knowing

- Kimi, Nosana endpoints, and Doubleword are all **OpenAI-API-compatible** — use
  the `openai` Python client, just change `base_url`/`api_key` (see `config.py`).
- Kimi base URL: `https://api.moonshot.ai/v1`. Docs: platform.moonshot.ai
- Doubleword batch API expects **JSONL** (one request per line); base URL
  `https://api.doubleword.ai/v1`.
- Nosana endpoints look like `https://<id>.node.k8s.prod.nos.ci/v1`.
- Python 3.10+.
