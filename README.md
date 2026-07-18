# Vantage · Voice + Face-ID Patient Frontend

A clean, minimalistic web app that lets a patient **sign in with Face ID** and
talk to the [Vantage](https://github.com/anasabdelhakmi/vantage) health agent
**by voice, in their own regional language** — no typing. Built for a hackathon demo.

## What it does

1. **Pick a language** — Southeast Asian regional languages, grouped by country:
   - 🇵🇭 Philippines — Filipino/Tagalog, Cebuano, Ilocano
   - 🇲🇾 Malaysia — Malay, Tamil
   - 🇹🇭 Thailand — Thai
   - 🇰🇭 Cambodia — Khmer

   (Add more in `src/i18n.ts`.)
2. **Face ID sign-in** — live camera scan animation, then verified. Falls back to
   a simulated scan if no camera is available, so the demo never dead-ends.
3. **Speak to the assistant** — dictate your symptoms with **Wispr Flow**; the
   reply appears as a chat bubble **and is spoken aloud** in your language.
4. **Escalation** — if the agent flags a dangerous case, a **Call a doctor**
   button appears and opens a live video call.

## Voice: Wispr Flow (input) + neural TTS (output)

- **Input** is handled by [**Wispr Flow**](https://wisprflow.ai), a system-level
  dictation app. The patient holds their Wispr Flow key and speaks in any of the
  supported languages; Wispr Flow auto-detects the language and inserts polished
  text into the focused field. This is far more accurate for Thai / Khmer /
  Tagalog / Malay than the browser's built-in speech recognition.
  → Install Wispr Flow on the demo machine and set its dictation hotkey first.
  You can also just type into the field if Wispr Flow isn't installed.
- **Output** (spoken reply) uses the browser's `SpeechSynthesis`, preferring the
  device's **enhanced / neural** voices for a natural sound. See
  [docs/BACKEND_INTEGRATION.md](docs/BACKEND_INTEGRATION.md) for wiring a cloud
  TTS endpoint if you want higher-quality voices for every language.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173) in **Chrome**. The Face-ID
camera needs a secure context; `localhost` counts as secure.

By default it runs in **mock mode** (no backend needed) so you can demo the full
experience immediately. A `demo` badge shows in the header.

## Connect the real backend

See [docs/BACKEND_INTEGRATION.md](docs/BACKEND_INTEGRATION.md). Short version:
wrap Vantage's `agent.ask()` in a ~15-line FastAPI `POST /api/chat`, then set
`VITE_API_BASE_URL` in `.env`.

## Tech

- Vite + React + TypeScript
- Wispr Flow for multilingual voice input (system dictation)
- `SpeechSynthesis` (enhanced voices) for spoken replies
- `getUserMedia` for the Face-ID camera
- [Jitsi Meet](https://jitsi.org) for the "Call a doctor" video call
- Zero UI dependencies — hand-written CSS

## Project structure

```
src/
  App.tsx                     # 3-stage flow: language → face → agent
  i18n.ts                     # languages (by country) + UI strings + mock copy
  api/
    agent.ts                  # backend client + offline mock (POST /api/chat)
    doctorCall.ts             # PII-free Jitsi room builder
  hooks/
    useSpeechSynthesis.ts     # spoken replies (prefers enhanced voices)
  components/
    LanguagePicker.tsx
    FaceLogin.tsx             # camera scan sign-in
    VoiceAgent.tsx            # Wispr Flow dictation + conversation
    DoctorCall.tsx            # embedded video call overlay
docs/BACKEND_INTEGRATION.md   # the POST /api/chat contract + FastAPI example
```

## Swapping Face ID for real biometrics

`FaceLogin.tsx` is deliberately isolated. For production, replace the simulated
match with **WebAuthn passkeys** (invokes the platform's real Face ID / Touch ID)
or a face-matching service — the rest of the app is untouched.
