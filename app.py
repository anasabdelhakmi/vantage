"""
VANTAGE WEB UI  --  the clinic copilot in the browser.

A light, clean, single-page web app that wraps the *existing* brain:
  * a chat copilot   -> calls agent.ask(msg)          (triage + restock)
  * an outbreak panel-> reads signals.oxylabs         (live or mock)
  * a focus-country map + a "Field Guide" education page for the
    South-East-Asian areas we target (higher disease burden, thinner care).

Design goals, on purpose:
  * ZERO extra dependencies. Uses only the Python standard library, so it
    still runs with `python app.py` and no `pip install` -- same promise as
    mock mode. agent.py / tools / the CLI are untouched.
  * One source of truth for the focus countries (FOCUS below), served to the
    frontend at /api/config so the map, signals and field guide all agree.

Run it:
    python app.py            # then open http://localhost:8000
    PORT=9000 python app.py  # pick another port
"""

import json
import os
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import agent
import config

# ---------------------------------------------------------------------------
# THE ONE KNOB: which South-East-Asian areas this deployment focuses on.
# Edit this list to retarget the map + field guide. `home` is the coordination
# base (Singapore, per the README); `countries` are the deployment areas we
# highlight in green -- chosen for the diseases the tools actually model
# (dengue, malaria, gastro/cholera from monsoon flooding, flu).
# ---------------------------------------------------------------------------
FOCUS = {
    "home": {"name": "Singapore", "iso3": "SGP", "lat": 1.29, "lng": 103.85},
    "countries": [
        {"name": "Indonesia",   "iso3": "IDN", "diseases": ["dengue", "malaria", "gastro"]},
        {"name": "Philippines", "iso3": "PHL", "diseases": ["dengue", "gastro", "flu"]},
        {"name": "Myanmar",     "iso3": "MMR", "diseases": ["malaria", "dengue", "gastro"]},
        {"name": "Cambodia",    "iso3": "KHM", "diseases": ["malaria", "dengue"]},
        {"name": "Laos",        "iso3": "LAO", "diseases": ["malaria", "gastro"]},
    ],
    # Shown faintly on the map for context (not deployment targets).
    "neighbours": ["MYS", "THA", "VNM", "BRN", "TLS"],
}


# ---------------------------------------------------------------------------
# Field-guide content -- short, educational disease notes for these areas.
# Not medical advice; a training aid for community health workers. Each entry
# links to the danger signs the triage/escalation tools act on and to the
# clinic medicine the restock tool orders for it.
# ---------------------------------------------------------------------------
FIELD_GUIDE = [
    {
        "disease": "dengue",
        "title": "Dengue fever",
        "spread": "Aedes mosquito (bites by day, breeds in clean standing water)",
        "hotspots": ["Indonesia", "Philippines", "Myanmar", "Cambodia"],
        "season": "Peaks in the rainy season — standing water after monsoon rains.",
        "symptoms": ["high fever", "severe headache", "pain behind the eyes",
                     "body aches", "skin rash"],
        "danger_signs": ["bleeding gums or nose", "blood in vomit or stool",
                         "severe belly pain", "restlessness or drowsiness"],
        "prevention": ["remove standing water weekly", "bed nets / repellent by day",
                       "cover water storage containers"],
        "medicine": "paracetamol",
        "note": "No aspirin/ibuprofen — they raise bleeding risk. Bleeding signs "
                "mean escalate to a doctor now.",
    },
    {
        "disease": "malaria",
        "title": "Malaria",
        "spread": "Anopheles mosquito (bites at night)",
        "hotspots": ["Myanmar", "Cambodia", "Laos", "Indonesia (Papua)"],
        "season": "Year-round in forested/border areas; rises after rains.",
        "symptoms": ["fever with chills and shivering", "heavy sweating",
                     "headache", "body aches"],
        "danger_signs": ["confusion or seizures", "very pale (severe anaemia)",
                         "difficulty breathing", "unable to keep fluids down"],
        "prevention": ["insecticide-treated bed nets at night",
                       "test fevers with a rapid diagnostic test",
                       "finish the full treatment course"],
        "medicine": "antimalarials",
        "note": "In the Greater Mekong (Myanmar/Cambodia/Laos) drug-resistant "
                "malaria is a real concern — confirm with a test, don't guess.",
    },
    {
        "disease": "gastro",
        "title": "Diarrhoeal disease / cholera",
        "spread": "Contaminated water or food — spikes after floods",
        "hotspots": ["Indonesia", "Philippines", "Laos", "Myanmar"],
        "season": "Monsoon flooding contaminates wells and drinking water.",
        "symptoms": ["watery diarrhoea", "vomiting", "stomach pain",
                     "signs of dehydration (thirst, little urine)"],
        "danger_signs": ["sunken eyes / no tears", "very drowsy or floppy",
                         "no urine for many hours", "blood in the stool"],
        "prevention": ["oral rehydration early and often", "boil or treat water",
                       "hand-washing with soap", "safe food handling"],
        "medicine": "rehydration_salts",
        "note": "Most deaths are from dehydration, not the infection — start "
                "oral rehydration salts immediately while assessing.",
    },
    {
        "disease": "flu",
        "title": "Influenza / respiratory infection",
        "spread": "Airborne droplets, coughs and sneezes",
        "hotspots": ["Philippines", "Indonesia", "Myanmar"],
        "season": "Circulates year-round in the tropics; crowding raises spread.",
        "symptoms": ["fever", "cough", "sore throat", "runny nose", "body aches"],
        "danger_signs": ["fast or laboured breathing", "chest pain",
                         "bluish lips", "very high fever in an infant"],
        "prevention": ["cover coughs", "hand hygiene", "rest and fluids",
                       "keep sick patients apart from others"],
        "medicine": "cough_syrup",
        "note": "Breathing difficulty is the line — that's a danger sign, not a "
                "simple cold, so escalate.",
    },
]


# ---------------------------------------------------------------------------
# Small JSON API on top of the existing code.
# ---------------------------------------------------------------------------
WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")


def _disease_map(signals, multipliers):
    """Collapse raw signals to one entry per disease (keep the strongest),
    and attach its demand multiplier. Used to build the per-country view."""
    best = {}
    for s in signals:
        cur = best.get(s.disease)
        if cur is None or s.strength > cur["strength"]:
            best[s.disease] = {"trend": s.trend, "strength": round(s.strength, 2),
                               "region": s.region, "source": s.source}
    for d, info in best.items():
        info["multiplier"] = round(multipliers.get(d, 1.0), 2)
    return best


def _signals_payload():
    """Outbreak signals, live or mock, grouped BY FOCUS COUNTRY so the UI can
    show a selected country first. A country's diseases come from FOCUS; each
    disease carries the current regional trend/strength/multiplier."""
    from signals.oxylabs import get_outbreak_signals, forecast_multipliers
    try:
        signals = get_outbreak_signals("all")
        multipliers = forecast_multipliers("all")
    except Exception as e:  # never let a flaky live fetch break the page
        return {"error": str(e), "by_country": [], "diseases": {},
                "live": config.use_live_signals()}

    dmap = _disease_map(signals, multipliers)

    by_country = []
    for c in FOCUS["countries"]:
        rows = []
        for d in c.get("diseases", []):
            info = dmap.get(d)
            if info:
                rows.append({"disease": d, "trend": info["trend"],
                             "strength": info["strength"], "multiplier": info["multiplier"]})
            else:
                # No active regional signal for this disease -> steady baseline.
                rows.append({"disease": d, "trend": "steady", "strength": 0.2,
                             "multiplier": round(multipliers.get(d, 1.0), 2)})
        # Show the most active diseases first within a country.
        rows.sort(key=lambda r: ({"rising": 0, "steady": 1, "falling": 2}[r["trend"]],
                                 -r["strength"]))
        by_country.append({"iso3": c["iso3"], "name": c["name"], "signals": rows})

    return {
        "live": config.use_live_signals(),
        "diseases": dmap,
        "by_country": by_country,
    }


def _restock_payload():
    """Forecast-adjusted reorder list for the clinic."""
    from tools.restock import run_restock
    lines = run_restock({})
    return {
        "orders": [
            {"medicine": l.medicine, "baseline": l.baseline,
             "multiplier": l.multiplier, "order": l.recommended_order,
             "reason": l.reason}
            for l in lines
        ]
    }


def _config_payload():
    return {
        "focus": FOCUS,
        "field_guide": FIELD_GUIDE,
        "mode": agent.current_mode(),
        "live_signals": config.use_live_signals(),
    }


class Handler(BaseHTTPRequestHandler):
    # Quieter logs -- one tidy line per request is enough for a demo.
    def log_message(self, fmt, *args):
        print(f"  [web] {self.command} {self.path}")

    # ---- helpers ----------------------------------------------------------
    def _send_json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, rel_path):
        # Serve a static file from web/ (index.html, style.css, app.js, ...).
        safe = os.path.normpath(rel_path).lstrip("\\/")
        full = os.path.join(WEB_DIR, safe)
        if not full.startswith(WEB_DIR) or not os.path.isfile(full):
            self.send_error(404, "Not found")
            return
        ctype = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml",
        }.get(os.path.splitext(full)[1], "application/octet-stream")
        with open(full, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---- routes -----------------------------------------------------------
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/" or path == "/index.html":
            self._send_file("index.html")
        elif path == "/api/config":
            self._send_json(_config_payload())
        elif path == "/api/signals":
            self._send_json(_signals_payload())
        elif path == "/api/restock":
            self._send_json(_restock_payload())
        else:
            self._send_file(path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/api/ask":
            self.send_error(404, "Not found")
            return
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            message = json.loads(raw or b"{}").get("message", "").strip()
        except json.JSONDecodeError:
            self._send_json({"error": "bad JSON"}, status=400)
            return
        if not message:
            self._send_json({"error": "empty message"}, status=400)
            return
        try:
            reply = agent.ask(message)
        except Exception as e:
            reply = f"(error running the brain: {e})"
        self._send_json({"reply": reply, "mode": agent.current_mode()})


def main():
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://localhost:{port}"
    mode = agent.current_mode()
    signals = "LIVE (Oxylabs)" if config.use_live_signals() else "MOCK (instant)"
    print("\n  Vantage web UI")
    print(f"  Brain: {mode.upper()}   Signals: {signals}")
    print(f"  Open:  {url}\n  (Ctrl-C to stop)\n")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  bye.")
        server.shutdown()


if __name__ == "__main__":
    main()
