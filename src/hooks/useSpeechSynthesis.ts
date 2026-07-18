import { useCallback, useEffect, useState } from "react";

// Voices whose names signal a higher-quality (neural) engine. macOS/iOS ship
// "Enhanced"/"Premium"/Siri voices that sound far better than the default ones,
// so we prefer them — this is the biggest lever we have on reply voice quality
// without a cloud TTS backend.
const GOOD_VOICE_HINTS = ["neural", "enhanced", "premium", "siri", "natural", "google"];

/**
 * Wrapper over SpeechSynthesis for speaking the assistant's replies aloud.
 * Picks the best-quality matching voice for the requested BCP-47 language.
 */
export function useSpeechSynthesis() {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [supported]);

  const pickVoice = useCallback(
    (lang: string): SpeechSynthesisVoice | undefined => {
      const base = lang.split("-")[0].toLowerCase();
      const forLang = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
      if (forLang.length === 0) return undefined;

      // Prefer an enhanced/neural voice, then an exact locale match, then any.
      const enhanced = forLang.find((v) =>
        GOOD_VOICE_HINTS.some((h) => v.name.toLowerCase().includes(h)),
      );
      const exact = forLang.find((v) => v.lang.toLowerCase() === lang.toLowerCase());
      return enhanced ?? exact ?? forLang[0];
    },
    [voices],
  );

  const speak = useCallback(
    (text: string, lang: string) => {
      if (!supported || !text) return;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      const voice = pickVoice(lang);
      if (voice) utterance.voice = voice;
      utterance.rate = 0.98;
      utterance.pitch = 1;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [supported, pickVoice],
  );

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  return { supported, speak, cancel, speaking };
}
