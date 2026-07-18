# Connecting this frontend to the Vantage backend

The frontend talks to exactly **one** endpoint. The Vantage repo
(`anasabdelhakmi/vantage`) already exposes everything we need through
`agent.ask(message: str) -> str`; the backend team only needs to put a thin
HTTP layer in front of it.

## Contract

```
POST /api/chat
Content-Type: application/json

Request:
{
  "message": "fever and headache for 3 days",   // required — patient's transcribed speech
  "lang": "en",                                   // language code (fil, ceb, ilo, ms, ta, th, km)
  "sessionId": "optional-uuid",                   // optional — for multi-turn context
  "patientId": "optional-id"                      // optional — from the Face-ID step
}

Response 200:
{
  "reply": "This sounds like a common viral infection...",
  "escalate": false                               // optional — see below
}
```

The frontend speaks `reply` aloud in the patient's language and shows it as a
chat bubble. No other endpoints are required for the demo.

### `escalate` — offer a video call with a doctor

`escalate` is **optional** and defaults to `false`. When the agent decides the
case needs a human clinician (e.g. dangerous symptoms), return `"escalate": true`.
The frontend then shows a **"Call a doctor"** button under that reply which opens
a live [Jitsi Meet](https://jitsi.org) video call. The room name is generated
client-side, is unguessable, and contains **no** patient data. Point
`VITE_JITSI_DOMAIN` at a self-hosted Jitsi server for production; it defaults to
the public `meet.jit.si` for demos.

## Reference FastAPI wrapper (~15 lines)

Drop this next to Vantage's `agent.py` as `server.py`:

```python
# server.py  — thin HTTP wrapper around vantage's agent.ask()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import agent  # vantage's coordinator (agent.ask)

app = FastAPI()

# Allow the Vite dev server (and your demo host) to call us.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten for production
    allow_methods=["POST"],
    allow_headers=["*"],
)

class ChatIn(BaseModel):
    message: str
    lang: str = "en"
    sessionId: str | None = None
    patientId: str | None = None

@app.post("/api/chat")
def chat(body: ChatIn):
    # Optionally prepend a language instruction so the agent replies in-language:
    prompt = f"[Reply in language: {body.lang}]\n{body.message}"
    return {"reply": agent.ask(prompt)}
```

Run it:

```bash
pip install fastapi "uvicorn[standard]"
uvicorn server:app --port 8000 --reload
```

## Pointing the frontend at it

Two options:

1. **Vite dev proxy (default).** `vite.config.ts` already proxies `/api` →
   `http://localhost:8000`. Leave `VITE_API_BASE_URL` empty-but-present is *not*
   enough — an empty value activates the built-in mock. To use the proxy, set
   any non-empty base that resolves to the same origin, or simply set:

   ```
   VITE_API_BASE_URL=http://localhost:8000
   ```

2. **Direct base URL.** Set `VITE_API_BASE_URL` in `.env` to wherever the
   backend runs (e.g. a deployed URL). CORS must allow the frontend origin.

## Mock mode

If `VITE_API_BASE_URL` is empty, the frontend uses a built-in rule-based mock
(`src/api/agent.ts`) that mimics triage / danger-escalation / restock replies in
all supported languages. This lets you demo the full UX — Face ID, voice in,
spoken reply — with **no backend running**. A small `demo` badge appears in the
header when the mock is active.

## Notes on language

- **Voice input** is captured by [Wispr Flow](https://wisprflow.ai), a
  system-level dictation app that auto-detects the spoken language and inserts
  transcribed text into the focused field. The backend therefore always receives
  already-transcribed plain text and stays language-agnostic.
- **Spoken replies** use the browser's `SpeechSynthesis`, keyed off the selected
  language's BCP-47 tag (e.g. `th-TH`, `km-KH`), preferring enhanced/neural voices.
- Passing `lang` lets the agent respond in the same language the patient used.

### Optional: higher-quality reply voices (`POST /api/tts`)

Browser voices for some regional languages are limited. If you want consistent,
natural speech, add an optional endpoint that returns audio for a piece of text:

```
POST /api/tts   { "text": "...", "lang": "th" }  ->  audio/mpeg bytes
```

Back it with any cloud TTS (e.g. Azure/Google/ElevenLabs neural voices). The
frontend can then play that audio instead of `SpeechSynthesis`; wire it in
`src/hooks/useSpeechSynthesis.ts`.
