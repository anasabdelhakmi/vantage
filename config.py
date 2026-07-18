"""
Central configuration for Vantage.

Everything the app needs to know about the outside world lives here:
API keys and the base URLs of the sponsor services.

IMPORTANT: The app runs in MOCK MODE by default (no keys needed), so your
whole team can run it and see it work today. To switch on a real service,
set the matching environment variable (e.g. export KIMI_API_KEY=sk-...).
"""

import os


# Load a local .env file if present (so `export ...` is optional). Tiny
# hand-rolled loader — no dependency needed, keeps mock mode zero-install.
def _load_dotenv(filename=".env"):
    here = os.path.dirname(os.path.abspath(__file__))
    full = os.path.join(here, filename)
    if not os.path.exists(full):
        return
    with open(full) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            # Don't clobber a value already set in the real environment.
            os.environ.setdefault(key.strip(), val.strip())


_load_dotenv()

# ---------------------------------------------------------------------------
# Kimi (the agent "brain"). OpenAI-compatible API.
# Get a key at https://platform.kimi.ai  ->  export KIMI_API_KEY=...
# NOTE: kimi-k2 was discontinued 2026-05-25. Default is now kimi-k3 (latest
# stable general-purpose model). Override KIMI_MODEL for e.g. kimi-k2.6.
# ---------------------------------------------------------------------------
KIMI_API_KEY = os.environ.get("KIMI_API_KEY", "")
KIMI_MODEL = os.environ.get("KIMI_MODEL", "kimi-k3")   # was "kimi-k2"
KIMI_BASE_URL = os.environ.get("KIMI_BASE_URL", "https://api.moonshot.ai/v1")  # unchanged

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
# --- Oxylabs Residential Proxy (raw HTML; country encoded in the username) ---
# https://oxylabs.io/products/residential-proxy-pool
OXYLABS_USERNAME = os.environ.get("OXYLABS_USERNAME", "")
OXYLABS_PASSWORD = os.environ.get("OXYLABS_PASSWORD", "")
OXYLABS_PROXY = os.environ.get("OXYLABS_PROXY", "pr.oxylabs.io:7777")

# --- Oxylabs Web Scraper API (JS rendering; reaches JS-heavy official sources) ---
# https://developers.oxylabs.io/scraping-solutions/web-scraper-api
OXYLABS_SCRAPER_USERNAME = os.environ.get("OXYLABS_SCRAPER_USERNAME", "")
OXYLABS_SCRAPER_PASSWORD = os.environ.get("OXYLABS_SCRAPER_PASSWORD", "")
OXYLABS_SCRAPER_URL = os.environ.get(
    "OXYLABS_SCRAPER_URL", "https://realtime.oxylabs.io/v1/queries")


def oxylabs_proxies():
    """requests-style proxies dict for the residential proxy, or None if unset."""
    if not (OXYLABS_USERNAME and OXYLABS_PASSWORD):
        return None
    url = f"http://{OXYLABS_USERNAME}:{OXYLABS_PASSWORD}@{OXYLABS_PROXY}"
    return {"http": url, "https": url}


def oxylabs_scraper_auth():
    """(user, password) for the Web Scraper API, or None if unset."""
    if not (OXYLABS_SCRAPER_USERNAME and OXYLABS_SCRAPER_PASSWORD):
        return None
    return (OXYLABS_SCRAPER_USERNAME, OXYLABS_SCRAPER_PASSWORD)


def oxylabs_enabled():
    """True if either Oxylabs product is configured (else the app uses mock signals)."""
    return bool(oxylabs_scraper_auth() or oxylabs_proxies())


def _env_bool(name, default):
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


# Demo toggle: live signals hit Oxylabs + the LLM extractor in real time (a few
# seconds, uses credits); mock signals are instant and deterministic. Flip with
# `USE_LIVE_SIGNALS=false python main.py` for a fast, offline-safe demo.
USE_LIVE_SIGNALS = _env_bool("USE_LIVE_SIGNALS", True)


def use_live_signals():
    """True to fetch real Oxylabs signals; False to force instant mock signals."""
    return USE_LIVE_SIGNALS

# ---------------------------------------------------------------------------
# ai& (offline bulk safety-testing of the triage tool). OpenAI-compatible API.
# Get a key from https://docs.aiand.com  ->  export AIAND_API_KEY=sk-...
# ---------------------------------------------------------------------------
AIAND_API_KEY = os.environ.get("AIAND_API_KEY", "")
AIAND_BASE_URL = os.environ.get("AIAND_BASE_URL", "https://api.aiand.com/v1")
AIAND_MODEL = os.environ.get("AIAND_MODEL", "openai/gpt-oss-120b")

# ---------------------------------------------------------------------------
# OpenAI (ChatGPT) — the agent "brain". Native OpenAI API (the one everything
# else is compatible with). Key from https://platform.openai.com/api-keys.
# Override OPENAI_MODEL for a different model (e.g. gpt-4o-mini, gpt-5).
# ---------------------------------------------------------------------------
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o")

# ---------------------------------------------------------------------------
# Daytona (secure elastic sandbox for running the agent's code in isolation).
# Create a key in the Daytona dashboard -> API Keys. https://www.daytona.io
# DAYTONA_API_URL / DAYTONA_TARGET are optional (SDK defaults to Daytona cloud).
# ---------------------------------------------------------------------------
DAYTONA_API_KEY = os.environ.get("DAYTONA_API_KEY", "")
DAYTONA_API_URL = os.environ.get("DAYTONA_API_URL", "")
DAYTONA_TARGET = os.environ.get("DAYTONA_TARGET", "")


def daytona_enabled():
    """True when a Daytona key is present (otherwise the app runs locally)."""
    return bool(DAYTONA_API_KEY)


# Optional: force a specific brain (kimi | aiand | nosana | mock). Leave blank
# for auto-detect. Handy when a provider is set but unavailable (e.g. Kimi has
# no balance) and you want to run the agent on ai& instead.
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "").strip().lower()


def active_llm():
    """
    Decide which 'brain' to talk to, and whether we can talk to it at all.

    Returns a tuple: (mode, base_url, api_key, model)
      mode == "mock"  -> no key found, use the built-in fake brain (runs offline)
      mode == "nosana"-> a Nosana endpoint URL is set, use that
      mode == "kimi"  -> a Kimi key is set, use Kimi's cloud
      mode == "aiand" -> use ai& (OpenAI-compatible, supports tool calling)
      mode == "openai"-> use OpenAI / ChatGPT (native OpenAI API)

    All non-mock modes speak the OpenAI API, so agent.py handles them the same
    way. Set LLM_PROVIDER to force one; otherwise auto-detect from what's set.
    """
    # Explicit override wins.
    if LLM_PROVIDER == "openai" and OPENAI_API_KEY:
        return ("openai", OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_MODEL)
    if LLM_PROVIDER == "aiand" and AIAND_API_KEY:
        return ("aiand", AIAND_BASE_URL, AIAND_API_KEY, AIAND_MODEL)
    if LLM_PROVIDER == "kimi" and KIMI_API_KEY:
        return ("kimi", KIMI_BASE_URL, KIMI_API_KEY, KIMI_MODEL)
    if LLM_PROVIDER == "nosana" and NOSANA_BASE_URL:
        return ("nosana", NOSANA_BASE_URL, KIMI_API_KEY or "not-needed", KIMI_MODEL)
    if LLM_PROVIDER == "mock":
        return ("mock", "", "", "mock-model")

    # Auto-detect.
    if NOSANA_BASE_URL:
        return ("nosana", NOSANA_BASE_URL, KIMI_API_KEY or "not-needed", KIMI_MODEL)
    if KIMI_API_KEY:
        return ("kimi", KIMI_BASE_URL, KIMI_API_KEY, KIMI_MODEL)
    if OPENAI_API_KEY:
        return ("openai", OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_MODEL)
    if AIAND_API_KEY:
        return ("aiand", AIAND_BASE_URL, AIAND_API_KEY, AIAND_MODEL)
    return ("mock", "", "", "mock-model")
