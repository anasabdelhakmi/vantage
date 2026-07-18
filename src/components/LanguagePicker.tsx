import { LANGUAGES, t } from "../i18n";

interface Props {
  value: string;
  onChange: (code: string) => void;
}

/** Grid of language cards shown before sign-in. */
export default function LanguagePicker({ value, onChange }: Props) {
  return (
    <div className="lang-picker">
      <p className="lang-heading">{t(value, "chooseLanguage")}</p>
      <div className="lang-grid">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            className={`lang-card ${value === lang.code ? "selected" : ""}`}
            onClick={() => onChange(lang.code)}
            dir={lang.dir}
          >
            <span className="lang-flag">{lang.countryFlag}</span>
            <span className="lang-native">{lang.native}</span>
            <span className="lang-label">{lang.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
