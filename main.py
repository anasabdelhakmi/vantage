"""
Vantage command-line demo.

Run it:   python main.py
Then type things like:
  fever, headache and body aches for 3 days
  patient has fever and a rash and bleeding gums
  what should we reorder this month?
  quit   (to exit)
"""

import agent
import config


BANNER = r"""
  __      __         _
  \ \    / /_ _ _ _ | |_ __ _ __ _ ___
   \ \/\/ / _` | ' \|  _/ _` / _` / -_)
    \_/\_/\__,_|_||_|\__\__,_\__, \___|
                             |___/
  Clinic copilot — triage + restock
"""


def main():
    print(BANNER)
    mode = agent.current_mode()
    print(f"  Running in {mode.upper()} mode.", end=" ")
    if mode == "mock":
        print("(No API key set — using the built-in offline brain.)")
        print("  To use real Kimi: export KIMI_API_KEY=sk-...  then rerun.")
    else:
        print()
    signals = "LIVE (Oxylabs)" if config.use_live_signals() else "MOCK (instant)"
    print(f"  Outbreak signals: {signals}.  Toggle with USE_LIVE_SIGNALS=true|false")
    print("  Type a patient's symptoms or a supply question. Type 'quit' to exit.\n")

    while True:
        try:
            msg = input("health worker > ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nbye.")
            break
        if msg.lower() in {"quit", "exit", "q"}:
            print("bye.")
            break
        if not msg:
            continue
        reply = agent.ask(msg)
        print(f"\nvantage >\n{reply}\n")


if __name__ == "__main__":
    main()
