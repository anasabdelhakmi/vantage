"""
Central configuration for Vantage.

Everything the app needs to know about the outside world lives here:
API keys and the base URLs of the sponsor services.

IMPORTANT: The app runs in MOCK MODE by default (no keys needed), so your
whole team can run it and see it work today. To switch on a real service,
set the matching environment variable (e.g. export KIMI_API_KEY=sk-...).
"""

import os

# ---------------------------------------------------------------------------
# Kimi (the agent "brain"). OpenAI-compatible API.
# Get a key at https://platform.moonshot.ai  ->  export KIMI_API_KEY=...
# ---------------------------------------------------------------------------
KIMI_API_KEY = os.environ.get("KIMI_API_KEY", "")
KIMI_BASE_URL = os.environ.get("KIMI_BASE_URL", "https://api.moonshot.ai/v1")
KIMI_MODEL = os.environ.get("KIMI_MODEL", "kimi-k2")

# ---------------------------------------------------------------------------
# Nosana (where you host the model instead of Kimi's cloud).
# After you deploy on https://deploy.nosana.com you get a URL like
# https://<id>.node.k8s.prod.nos.ci/v1  -- paste it here to use it instead.
# It's ALSO OpenAI-compatible, so the code doesn't change, only the URL.
# ---------------------------------------------------------------------------
NOSANA_BASE_URL = os.environ.get("NOSANA_BASE_URL", "")

# ---------------------------------------------------------------------------
# Oxylabs (fetches outbreak / weather news for the restock tool).
# ---------------------------------------------------------------------------
OXYLABS_USERNAME = os.environ.get("OXYLABS_USERNAME", "")
OXYLABS_PASSWORD = os.environ.get("OXYLABS_PASSWORD", "")

# ---------------------------------------------------------------------------
# Doubleword (offline bulk testing of the triage tool).
# ---------------------------------------------------------------------------
DOUBLEWORD_API_KEY = os.environ.get("DOUBLEWORD_API_KEY", "")
DOUBLEWORD_BASE_URL = os.environ.get("DOUBLEWORD_BASE_URL", "https://api.doubleword.ai/v1")


def active_llm():
    """
    Decide which 'brain' to talk to, and whether we can talk to it at all.

    Returns a tuple: (mode, base_url, api_key, model)
      mode == "mock"  -> no key found, use the built-in fake brain (runs offline)
      mode == "nosana"-> a Nosana endpoint URL is set, use that
      mode == "kimi"  -> a Kimi key is set, use Kimi's cloud
    """
    if NOSANA_BASE_URL:
        return ("nosana", NOSANA_BASE_URL, KIMI_API_KEY or "not-needed", KIMI_MODEL)
    if KIMI_API_KEY:
        return ("kimi", KIMI_BASE_URL, KIMI_API_KEY, KIMI_MODEL)
    return ("mock", "", "", "mock-model")
