// Helper for the "Call a doctor" video-call feature.
//
// We use Jitsi Meet (open source). On a Jitsi server the URL *path is the room*:
// visiting a URL creates the room on the spot, and anyone who opens the same URL
// joins the same call — no "create room" API, no accounts.
//
// The public server https://meet.jit.si works out of the box for demos. For
// production you would self-host Jitsi (Docker) and set VITE_JITSI_DOMAIN.
//
// SECURITY: the room name is the only lock — anyone with the URL can join. So we
// (a) always append a random, unguessable token, and (b) NEVER put patient
// names or IDs in the room name (it's visible in the URL). Only an opaque
// session id + random token go in.

export const JITSI_DOMAIN = import.meta.env.VITE_JITSI_DOMAIN?.trim() || "meet.jit.si";

export interface DoctorRoom {
  /** Jitsi room name — used by the embedded External API. */
  roomName: string;
  /** Full URL — used for the "open in a new tab" fallback and for sharing. */
  url: string;
}

/** Build an unguessable, PII-free room for a given (opaque) session. */
export function makeDoctorRoom(sessionId: string): DoctorRoom {
  const token = randomToken();
  // Keep the session fragment short and opaque so the URL carries no patient data.
  const shortSession = sessionId.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "session";
  const roomName = `vantage-${shortSession}-${token}`;
  return { roomName, url: `https://${JITSI_DOMAIN}/${roomName}` };
}

function randomToken(): string {
  // 8 bytes of randomness, base36-ish, URL-safe and unguessable.
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}
