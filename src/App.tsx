import { useState } from "react";
import LanguagePicker from "./components/LanguagePicker";
import FaceLogin from "./components/FaceLogin";
import VoiceAgent from "./components/VoiceAgent";
import { findLanguage, t } from "./i18n";

type Stage = "language" | "face" | "agent";

export default function App() {
  const [langCode, setLangCode] = useState("en");
  const [stage, setStage] = useState<Stage>("language");
  const lang = findLanguage(langCode);

  return (
    <div className="app" dir={lang.dir}>
      {stage !== "agent" && (
        <div className="hero">
          <div className="logo-badge">✚</div>
          <h1 className="hero-title">{t(langCode, "appName")}</h1>
          <p className="hero-tagline">{t(langCode, "tagline")}</p>
        </div>
      )}

      <main className="stage">
        {stage === "language" && (
          <>
            <LanguagePicker value={langCode} onChange={setLangCode} />
            <button className="btn-primary wide" onClick={() => setStage("face")}>
              {t(langCode, "faceTitle")}
            </button>
          </>
        )}

        {stage === "face" && (
          <FaceLogin langCode={langCode} onSuccess={() => setStage("agent")} />
        )}

        {stage === "agent" && (
          <VoiceAgent
            langCode={langCode}
            onSignOut={() => setStage("language")}
          />
        )}
      </main>
    </div>
  );
}
