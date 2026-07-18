"""
OXYLABS SIGNAL FETCHER  --  "the runner who fetches outside news"

Job: pull forward-looking signals (outbreak news, weather) from the web and
turn them into a simple structured forecast the restock tool can use.

Runs in MOCK MODE by default (returns realistic fake signals) so the app works
with no credentials. When OXYLABS_USERNAME / OXYLABS_PASSWORD are set, it calls
the real Oxylabs Web Scraper API.
"""

import time
from dataclasses import dataclass
from typing import Dict, List

import config

# In-memory cache of the last live scrape, keyed by region. A live fetch is
# slow (~30s: several page fetches + LLM extraction), and both the signals panel
# and the restock forecast ask for the same data — so we scrape once and reuse
# it for a few minutes instead of re-scraping on every request.
_SIGNAL_CACHE: Dict[str, "tuple"] = {}     # region -> (timestamp, signals)
_SIGNAL_TTL = 600                          # seconds (10 min)


@dataclass
class OutbreakSignal:
    disease: str
    region: str
    trend: str          # "rising", "steady", or "falling"
    strength: float     # 0..1, how strong the signal is
    source: str


# ---- MOCK data: what a realistic scrape might yield this week -------------
_MOCK_SIGNALS: List[OutbreakSignal] = [
    OutbreakSignal("dengue", "neighbouring province", "rising", 0.8,
                   "mock: ministry-of-health advisory"),
    OutbreakSignal("flu", "regional", "steady", 0.4,
                   "mock: regional news"),
    OutbreakSignal("gastro", "local", "rising", 0.55,
                   "mock: weather (monsoon flooding)"),
]


def _html_to_text(html: str, limit: int = 6000) -> str:
    """Strip tags/scripts and collapse whitespace so we send the LLM clean text."""
    import re

    text = re.sub(r"(?is)<(script|style).*?</\1>", " ", html)  # drop script/style
    text = re.sub(r"(?s)<[^>]+>", " ", text)                   # drop remaining tags
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


# The tool the extractor model must call, so we get structured signals back
# instead of parsing prose. Same idea as the ai& safety test.
_EXTRACT_TOOL = [{
    "type": "function",
    "function": {
        "name": "report_outbreak_signals",
        "description": "Report disease-outbreak / weather signals found in the text.",
        "parameters": {
            "type": "object",
            "properties": {
                "signals": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "disease": {
                                "type": "string",
                                "description": "e.g. dengue, flu, malaria, gastro",
                            },
                            "region": {"type": "string"},
                            "trend": {
                                "type": "string",
                                "enum": ["rising", "steady", "falling"],
                            },
                            "strength": {
                                "type": "number",
                                "description": "0..1 confidence/intensity of the signal",
                            },
                        },
                        "required": ["disease", "region", "trend", "strength"],
                    },
                }
            },
            "required": ["signals"],
        },
    },
}]


def _extract_signals(page_text: str, source: str) -> List[OutbreakSignal]:
    """
    Turn scraped page text into structured OutbreakSignal objects using the
    active LLM brain (Kimi / ai& / OpenAI / Nosana — all OpenAI-compatible).
    Returns [] when running in mock mode (no brain available) so the caller
    falls back to mock signals.
    """
    mode, base_url, api_key, model = config.active_llm()
    if mode == "mock" or not page_text.strip():
        return []

    from openai import OpenAI  # imported here so mock mode needs no dependency

    client = OpenAI(api_key=api_key, base_url=base_url)
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system",
             "content": "You extract disease-outbreak and weather-driven health "
                        "signals from news/advisory text for a clinic restocking "
                        "tool. Only report signals actually supported by the text. "
                        "Map each disease to one of these canonical names when it "
                        "applies: dengue, flu, malaria, gastro (use 'gastro' for "
                        "gastroenteritis / diarrhoeal disease, 'flu' for influenza). "
                        "Use another lowercase name only if none of these fit. "
                        "Always answer by calling report_outbreak_signals."},
            {"role": "user", "content": page_text},
        ],
        tools=_EXTRACT_TOOL,
        tool_choice={"type": "function",
                     "function": {"name": "report_outbreak_signals"}},
    )
    call = resp.choices[0].message.tool_calls[0]
    import json

    raw = json.loads(call.function.arguments or "{}").get("signals", [])
    signals: List[OutbreakSignal] = []
    for s in raw:
        trend = str(s.get("trend", "steady")).lower()
        if trend not in ("rising", "steady", "falling"):
            trend = "steady"
        try:
            strength = float(s.get("strength", 0.5))
        except (TypeError, ValueError):
            strength = 0.5
        strength = max(0.0, min(1.0, strength))  # clamp to 0..1
        signals.append(OutbreakSignal(
            disease=str(s.get("disease", "")).strip().lower(),
            region=str(s.get("region", "")).strip() or "unknown",
            trend=trend,
            strength=strength,
            source=source,
        ))
    return [s for s in signals if s.disease]


def _fetch_via_scraper(url: str) -> str:
    """Web Scraper API — renders JavaScript, so it reads JS-heavy official pages
    (WHO/MoH dashboards) the proxy can't. Returns the page HTML."""
    import requests

    resp = requests.post(
        config.OXYLABS_SCRAPER_URL,
        auth=config.oxylabs_scraper_auth(),
        json={"source": "universal", "url": url, "render": "html"},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["results"][0]["content"]


def _fetch_via_proxy(url: str) -> str:
    """Residential Proxy — raw HTML, fast. Ideal for server-rendered news/RSS."""
    import requests

    headers = {"User-Agent": "Mozilla/5.0 (Vantage clinic restock signal fetcher)"}
    resp = requests.get(url, proxies=config.oxylabs_proxies(), headers=headers, timeout=60)
    resp.raise_for_status()
    return resp.text


def _fetch_real(query_urls: List[str], fetcher) -> List[OutbreakSignal]:
    """
    Fetch each URL with the given `fetcher` backend, then extract structured
    outbreak signals from the page text with the active LLM brain.
    """
    import requests  # for the exception type; mock mode never reaches here

    signals: List[OutbreakSignal] = []
    for url in query_urls:
        try:
            html = fetcher(url)
        except (requests.RequestException, KeyError, ValueError, IndexError) as e:
            # One bad page shouldn't sink the whole restock forecast.
            print(f"[oxylabs] fetch failed for {url}: {e}")
            continue
        signals.extend(_extract_signals(_html_to_text(html), source=f"oxylabs: {url}"))
    return signals


def get_outbreak_signals(region: str = "all") -> List[OutbreakSignal]:
    """
    Main entry point. Returns a list of OutbreakSignal.

    Each Oxylabs product is used where it's strong: the Residential Proxy fetches
    server-rendered news RSS (the actionable dengue/flu/malaria/gastro trends);
    the Web Scraper API renders JS-heavy official pages (WHO/MoH). Falls back to
    mock signals if the live toggle is off, nothing is configured, or nothing is
    extracted.
    """
    if not config.use_live_signals():
        return list(_MOCK_SIGNALS)

    # Serve a recent scrape from cache if we have one (avoids the double-fetch
    # between the signals panel and the restock forecast, and makes repeat
    # loads instant).
    cached = _SIGNAL_CACHE.get(region)
    if cached and (time.time() - cached[0]) < _SIGNAL_TTL:
        return cached[1]

    signals: List[OutbreakSignal] = []
    if config.oxylabs_proxies():
        signals += _fetch_real(NEWS_FEEDS, _fetch_via_proxy)
    if config.oxylabs_scraper_auth():
        signals += _fetch_real(OFFICIAL_SOURCES, _fetch_via_scraper)
    result = signals if signals else list(_MOCK_SIGNALS)
    _SIGNAL_CACHE[region] = (time.time(), result)
    return result


# Server-rendered news RSS (fetched via the Residential Proxy), one query per
# driver disease. Swap/extend for the region and languages you're targeting.
NEWS_FEEDS: List[str] = [
    "https://news.google.com/rss/search?q=dengue+outbreak+Singapore+OR+Malaysia+OR+Indonesia+when:21d&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=influenza+flu+outbreak+Asia+when:21d&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=malaria+outbreak+Asia+when:21d&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=cholera+OR+gastroenteritis+outbreak+flooding+Asia+when:21d&hl=en-US&gl=US&ceid=US:en",
]

# JS-heavy authoritative pages (fetched via the Web Scraper API's JS rendering).
OFFICIAL_SOURCES: List[str] = [
    "https://www.who.int/emergencies/disease-outbreak-news",
]


def forecast_multipliers(region: str = "all") -> Dict[str, float]:
    """
    Convert outbreak signals into per-disease demand multipliers the restock
    tool can multiply against baseline usage.

    Example return: {"dengue": 1.6, "gastro": 1.3, "flu": 1.0}
    A multiplier of 1.6 means "order ~60% more than the historical baseline".
    """
    multipliers: Dict[str, float] = {}
    for sig in get_outbreak_signals(region):
        if sig.trend == "rising":
            m = round(1.0 + sig.strength, 2)
        elif sig.trend == "falling":
            m = round(max(0.5, 1.0 - sig.strength), 2)
        else:
            m = 1.0
        # A disease can appear in several signals (different regions/sources).
        # Keep the strongest so a credible "rising" report isn't overwritten by
        # a later "steady" one — order ahead if any source says it's climbing.
        multipliers[sig.disease] = max(multipliers.get(sig.disease, 0.0), m)
    return multipliers
