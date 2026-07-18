import { useEffect, useRef, useState } from "react";
import { JITSI_DOMAIN, type DoctorRoom } from "../api/doctorCall";
import { t } from "../i18n";

interface Props {
  langCode: string;
  room: DoctorRoom;
  onClose: () => void;
}

// The Jitsi External API attaches a constructor to window when external_api.js
// loads. We only need a minimal shape of it here.
type JitsiApi = { addListener: (e: string, cb: () => void) => void; dispose: () => void };
declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiApi;
  }
}

const SCRIPT_ID = "jitsi-external-api";

/** Loads external_api.js once and resolves when window.JitsiMeetExternalAPI is ready. */
function loadJitsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) return resolve();

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script error")));
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://${JITSI_DOMAIN}/external_api.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("script error"));
    document.body.appendChild(script);
  });
}

/** Full-screen overlay that embeds a live Jitsi video call with a remote doctor. */
export default function DoctorCall({ langCode, room, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const [failed, setFailed] = useState(false);
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    loadJitsiScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.JitsiMeetExternalAPI) {
          if (!cancelled) setFailed(true);
          return;
        }
        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName: room.roomName,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          userInfo: { displayName: t(langCode, "you") },
          configOverwrite: { prejoinPageEnabled: false, startWithAudioMuted: false },
          interfaceConfigOverwrite: { MOBILE_APP_PROMO: false },
        });
        apiRef.current = api;
        // Patient hangs up inside Jitsi → close the overlay.
        api.addListener("readyToClose", onClose);
        api.addListener("videoConferenceJoined", () => setConnecting(false));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="doctor-call-overlay" role="dialog" aria-modal="true">
      <header className="doctor-call-bar">
        <span className="doctor-call-title">
          <span className="doctor-call-live" /> {t(langCode, "doctorCallTitle")}
        </span>
        <button className="doctor-call-end" onClick={onClose}>
          {t(langCode, "endCall")}
        </button>
      </header>

      <div className="doctor-call-stage">
        {failed ? (
          <div className="doctor-call-fallback">
            <p>{t(langCode, "doctorCallFallback")}</p>
            <a className="btn-primary" href={room.url} target="_blank" rel="noopener noreferrer">
              {t(langCode, "openInNewTab")}
            </a>
          </div>
        ) : (
          <>
            {connecting && <p className="doctor-call-connecting">{t(langCode, "connectingDoctor")}</p>}
            <div className="doctor-call-frame" ref={containerRef} />
          </>
        )}
      </div>
    </div>
  );
}
