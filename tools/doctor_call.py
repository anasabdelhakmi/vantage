"""
DOCTOR CALL  --  "the phone line to the remote doctor"

Job: when the escalation check decides a case needs a doctor, hand the health
worker a one-tap link to the on-call doctor's video room.

We use Jitsi Meet's public infrastructure (https://meet.jit.si): the URL path
IS the room. Visiting a URL creates it on the spot; anyone who opens the same
URL lands in the same call. No account, no API key, no server to run -- same
"works with no credentials" promise as the rest of the app.

We use a FIXED standing room (config.DOCTOR_ROOM) so the on-call doctor can keep
it open on their phone and always be reachable -- every escalation lands in the
same call. Two safety rules:
  1. The room name is the ONLY lock on the call, so it must be unguessable.
     The default is a fixed but random-looking name; override DOCTOR_ROOM to
     set your own.
  2. The room name is visible in the URL, so it never contains patient names or
     IDs -- no PII, ever.

Docs: https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe/
"""

import config

# Public Jitsi server. Swap for a self-hosted host (e.g. "meet.myclinic.org")
# for production; nothing else here changes.
JITSI_HOST = "meet.jit.si"


def make_doctor_room() -> dict:
    """
    Return the on-call doctor's standing video room.

    Returns a small dict the UI can use directly:
        {
          "host": "meet.jit.si",
          "room": "vantage-oncall-q7f39kzt4m",   # fixed, no patient data
          "url":  "https://meet.jit.si/vantage-oncall-q7f39kzt4m",
        }

    The room is FIXED (config.DOCTOR_ROOM) so the doctor can pre-join and always
    be there when a health worker taps "connect to a doctor".
    """
    room = config.DOCTOR_ROOM
    return {
        "host": JITSI_HOST,
        "room": room,
        "url": f"https://{JITSI_HOST}/{room}",
    }


if __name__ == "__main__":
    # Quick manual check: python -m tools.doctor_call
    print(make_doctor_room())
