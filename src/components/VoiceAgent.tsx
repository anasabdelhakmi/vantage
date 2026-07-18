import { useEffect, useRef, useState } from "react";
import { sendMessage, usingMock } from "../api/agent";
import { findLanguage, t } from "../i18n";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { makeDoctorRoom, type DoctorRoom } from "../api/doctorCall";
import DoctorCall from "./DoctorCall";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** When true, the assistant escalated this case — show a "Call a doctor" button. */
  escalate?: boolean;
}

interface Props {
  langCode: string;
  onSignOut: () => void;
}

/**
 * Main patient screen. The patient dictates their symptoms with Wispr Flow
 * (system-level speech-to-text) straight into the text field — no in-app mic —
 * and the assistant's reply is shown as a bubble and spoken aloud.
 */
export default function VoiceAgent({ langCode, onSignOut }: Props) {
  const lang = findLanguage(langCode);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [call, setCall] = useState<DoctorRoom | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // One opaque session id per sign-in — used to build the (PII-free) call room.
  const sessionId = useRef(crypto.randomUUID());

  const synth = useSpeechSynthesis();

  // Greet the patient once, both on screen and aloud.
  useEffect(() => {
    const greeting = t(langCode, "greeting");
    setMessages([{ id: "greet", role: "assistant", text: greeting }]);
    synth.speak(greeting, lang.speechLang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  async function handleSend(text: string) {
    const transcript = text.trim();
    if (!transcript || thinking) return;

    setInput("");
    synth.cancel();
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text: transcript };
    setMessages((prev) => [...prev, userMsg]);
    setThinking(true);
    try {
      const { reply, escalate } = await sendMessage({
        message: transcript,
        lang: langCode,
        sessionId: sessionId.current,
      });
      const botMsg: Message = { id: crypto.randomUUID(), role: "assistant", text: reply, escalate };
      setMessages((prev) => [...prev, botMsg]);
      synth.speak(reply, lang.speechLang);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Sorry, there was a connection problem. Please try again.",
        },
      ]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="voice-agent" dir={lang.dir}>
      <header className="agent-header">
        <div className="brand">
          <span className="brand-dot" />
          {t(langCode, "appName")}
          {usingMock && <span className="mock-badge">demo</span>}
        </div>
        <button className="btn-ghost" onClick={onSignOut}>
          {t(langCode, "signOut")}
        </button>
      </header>

      <div className="conversation" ref={scrollRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`bubble ${msg.role}`}>
            <span className="bubble-role">
              {msg.role === "user" ? t(langCode, "you") : t(langCode, "assistant")}
            </span>
            <p>{msg.text}</p>
            {msg.escalate && (
              <button
                className="call-doctor-btn"
                onClick={() => setCall(makeDoctorRoom(sessionId.current))}
              >
                <VideoIcon />
                {t(langCode, "callDoctor")}
              </button>
            )}
          </div>
        ))}
        {thinking && (
          <div className="bubble assistant">
            <span className="bubble-role">{t(langCode, "assistant")}</span>
            <div className="dots"><span/><span/><span/></div>
          </div>
        )}
      </div>

      <form
        className="compose"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(input);
        }}
      >
        <textarea
          className="compose-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(input);
            }
          }}
          placeholder={t(langCode, "dictatePlaceholder")}
          rows={2}
          dir={lang.dir}
        />
        <button className="compose-send" type="submit" disabled={thinking || !input.trim()}>
          {thinking ? t(langCode, "thinking") : t(langCode, "send")}
        </button>
        <p className="compose-hint">{t(langCode, "dictateHint")}</p>
      </form>

      {call && (
        <DoctorCall langCode={langCode} room={call} onClose={() => setCall(null)} />
      )}
    </div>
  );
}

function VideoIcon() {
  // Video-camera glyph — this is a video call.
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="6" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M15 10.5 21 7v10l-6-3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
