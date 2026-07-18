import { useEffect, useRef, useState } from "react";
import { findLanguage, t } from "../i18n";

type Phase = "idle" | "starting" | "scanning" | "verified";

interface Props {
  langCode: string;
  onSuccess: () => void;
}

/**
 * Face-ID sign-in screen.
 *
 * For the demo this uses the live webcam plus a scan animation and then
 * "verifies" the patient. It's intentionally decoupled from any real identity
 * check so it can be swapped for WebAuthn passkeys (platform Face ID / Touch ID)
 * or a real face-matching service without touching the rest of the app.
 */
export default function FaceLogin({ langCode, onSuccess }: Props) {
  const lang = findLanguage(langCode);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function runScan() {
    setPhase("scanning");
    // Simulated biometric match. Replace with a real check when available.
    window.setTimeout(() => {
      setPhase("verified");
      window.setTimeout(() => {
        stopCamera();
        onSuccess();
      }, 900);
    }, 2600);
  }

  async function startFaceId() {
    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 640 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      runScan();
    } catch {
      // No camera / permission denied (e.g. demo laptop). Don't dead-end the
      // demo — fall back to a simulated scan using the placeholder avatar.
      runScan();
    }
  }

  return (
    <div className="face-login" dir={lang.dir}>
      <h1 className="face-title">{t(langCode, "faceTitle")}</h1>
      <p className="face-hint">
        {phase === "scanning"
          ? t(langCode, "scanning")
          : phase === "verified"
            ? t(langCode, "verified")
            : t(langCode, "faceHint")}
      </p>

      <div className={`face-frame phase-${phase}`}>
        <video ref={videoRef} className="face-video" playsInline muted />
        {phase === "idle" && <div className="face-placeholder">🙂</div>}
        {phase === "scanning" && <div className="scan-line" />}
        <div className="face-ring" />
        {phase === "verified" && <div className="face-check">✓</div>}
      </div>

      {phase === "idle" && (
        <button className="btn-primary" onClick={startFaceId}>
          {t(langCode, "startCamera")}
        </button>
      )}
      {phase === "starting" && <div className="dots" aria-label="loading"><span/><span/><span/></div>}
    </div>
  );
}
