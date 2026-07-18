"""
OXYLABS SIGNAL FETCHER  --  "the runner who fetches outside news"

Job: pull forward-looking signals (outbreak news, weather) from the web and
turn them into a simple structured forecast the restock tool can use.

Runs in MOCK MODE by default (returns realistic fake signals) so the app works
with no credentials. When OXYLABS_USERNAME / OXYLABS_PASSWORD are set, it calls
the real Oxylabs Web Scraper API.
"""

from dataclasses import dataclass
from typing import Dict, List

import config


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


def _fetch_real(query_urls: List[str]) -> List[OutbreakSignal]:
    """
    Call the real Oxylabs Web Scraper API. Kept minimal on purpose.
    Docs: https://developers.oxylabs.io/scraping-solutions/web-scraper-api

    NOTE: parsing real pages into OutbreakSignal objects is the part you'd
    flesh out during the hackathon (feed the scraped text to the LLM and ask
    it to extract disease/region/trend). Left as a clear TODO.
    """
    import requests  # imported here so mock mode needs no dependencies

    signals: List[OutbreakSignal] = []
    for url in query_urls:
        payload = {"source": "universal", "url": url, "render": "html"}
        resp = requests.post(
            "https://realtime.oxylabs.io/v1/queries",
            auth=(config.OXYLABS_USERNAME, config.OXYLABS_PASSWORD),
            json=payload,
            timeout=60,
        )
        resp.raise_for_status()
        _page_text = resp.json()["results"][0]["content"]
        # TODO: extract structured signals from _page_text (e.g. via the LLM).
        # For now the real branch returns nothing until extraction is added.
    return signals


def get_outbreak_signals(region: str = "all") -> List[OutbreakSignal]:
    """
    Main entry point. Returns a list of OutbreakSignal.
    Uses real Oxylabs if credentials are present, otherwise mock signals.
    """
    if config.OXYLABS_USERNAME and config.OXYLABS_PASSWORD:
        urls = [
            # Replace with the real advisory / news / weather pages you target.
            "https://example.com/health-advisories",
        ]
        real = _fetch_real(urls)
        if real:
            return real
        # fall through to mock if extraction not implemented yet
    return list(_MOCK_SIGNALS)


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
            multipliers[sig.disease] = round(1.0 + sig.strength, 2)
        elif sig.trend == "falling":
            multipliers[sig.disease] = round(max(0.5, 1.0 - sig.strength), 2)
        else:
            multipliers[sig.disease] = 1.0
    return multipliers
