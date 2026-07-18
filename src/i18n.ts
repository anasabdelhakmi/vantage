// Language configuration for the patient voice assistant.
//
// Scope for now: Southeast Asian regional languages across the Philippines,
// Malaysia, Thailand, and Cambodia. Voice INPUT is handled by Wispr Flow
// (system dictation, https://wisprflow.ai) which auto-detects the spoken
// language — so `speechLang` here is used mainly for the spoken REPLY (TTS)
// and as a hint. Add languages by extending `LANGUAGES`.

export type Dir = "ltr" | "rtl";

export interface Language {
  code: string; // short id, also used for mock/reply language
  speechLang: string; // BCP-47, used for text-to-speech of replies
  label: string; // English name
  native: string; // endonym, shown to the patient
  country: string; // grouping label
  countryFlag: string; // emoji flag for the country group
  dir: Dir;
}

export const LANGUAGES: Language[] = [
  // 🌐 Regional lingua franca
  { code: "en", speechLang: "en-US", label: "English", native: "English", country: "English", countryFlag: "🌐", dir: "ltr" },
  // 🇵🇭 Philippines
  { code: "fil", speechLang: "fil-PH", label: "Filipino / Tagalog", native: "Filipino", country: "Philippines", countryFlag: "🇵🇭", dir: "ltr" },
  { code: "ceb", speechLang: "ceb-PH", label: "Cebuano", native: "Bisaya", country: "Philippines", countryFlag: "🇵🇭", dir: "ltr" },
  { code: "ilo", speechLang: "ilo-PH", label: "Ilocano", native: "Ilokano", country: "Philippines", countryFlag: "🇵🇭", dir: "ltr" },
  // 🇲🇾 Malaysia
  { code: "ms", speechLang: "ms-MY", label: "Malay", native: "Bahasa Melayu", country: "Malaysia", countryFlag: "🇲🇾", dir: "ltr" },
  { code: "ta", speechLang: "ta-IN", label: "Tamil", native: "தமிழ்", country: "Malaysia", countryFlag: "🇲🇾", dir: "ltr" },
  // 🇹🇭 Thailand
  { code: "th", speechLang: "th-TH", label: "Thai", native: "ไทย", country: "Thailand", countryFlag: "🇹🇭", dir: "ltr" },
  // 🇰🇭 Cambodia
  { code: "km", speechLang: "km-KH", label: "Khmer", native: "ខ្មែរ", country: "Cambodia", countryFlag: "🇰🇭", dir: "ltr" },
];

export interface CountryGroup {
  country: string;
  flag: string;
  languages: Language[];
}

/** Languages grouped by country, preserving declaration order. */
export function countryGroups(): CountryGroup[] {
  const groups: CountryGroup[] = [];
  for (const lang of LANGUAGES) {
    let group = groups.find((g) => g.country === lang.country);
    if (!group) {
      group = { country: lang.country, flag: lang.countryFlag, languages: [] };
      groups.push(group);
    }
    group.languages.push(lang);
  }
  return groups;
}

type StringKey =
  | "appName"
  | "tagline"
  | "chooseLanguage"
  | "faceTitle"
  | "faceHint"
  | "scanning"
  | "verified"
  | "startCamera"
  | "greeting"
  | "you"
  | "assistant"
  | "signOut"
  | "dictatePlaceholder"
  | "dictateHint"
  | "send"
  | "thinking"
  | "callDoctor"
  | "doctorCallTitle"
  | "connectingDoctor"
  | "endCall"
  | "doctorCallFallback"
  | "openInNewTab";

export const STRINGS: Record<string, Record<StringKey, string>> = {
  en: {
    appName: "Vantage",
    tagline: "Your voice health assistant",
    chooseLanguage: "Choose your language",
    faceTitle: "Sign in with Face ID",
    faceHint: "Look at the camera to verify it's you",
    scanning: "Scanning your face…",
    verified: "Verified",
    startCamera: "Start Face ID",
    greeting: "Hello, how are you feeling today? Speak and tell me your symptoms.",
    you: "You",
    assistant: "Assistant",
    signOut: "Sign out",
    dictatePlaceholder: "Speak or type your symptoms…",
    dictateHint: "Hold your Wispr Flow key and speak — no typing needed.",
    send: "Send",
    thinking: "Thinking…",
    callDoctor: "Call a doctor",
    doctorCallTitle: "Live with a doctor",
    connectingDoctor: "Connecting you to a doctor…",
    endCall: "End call",
    doctorCallFallback: "The video call couldn't load here. Open it in a new tab instead:",
    openInNewTab: "Open video call",
  },
  fil: {
    appName: "Vantage",
    tagline: "Ang iyong voice health assistant",
    chooseLanguage: "Pumili ng iyong wika",
    faceTitle: "Mag-sign in gamit ang Face ID",
    faceHint: "Tumingin sa camera para ma-verify",
    scanning: "Sina-scan ang iyong mukha…",
    verified: "Na-verify",
    startCamera: "Simulan ang Face ID",
    greeting: "Kumusta, ano ang nararamdaman mo ngayon? Magsalita at sabihin ang iyong mga sintomas.",
    you: "Ikaw",
    assistant: "Assistant",
    signOut: "Mag-sign out",
    dictatePlaceholder: "Magsalita o mag-type ng iyong sintomas…",
    dictateHint: "Pindutin ang iyong Wispr Flow key at magsalita — hindi na kailangang mag-type.",
    send: "Ipadala",
    thinking: "Nag-iisip…",
    callDoctor: "Tumawag sa doktor",
    doctorCallTitle: "Live kasama ang doktor",
    connectingDoctor: "Kinukonekta ka sa isang doktor…",
    endCall: "Tapusin ang tawag",
    doctorCallFallback: "Hindi ma-load ang video call dito. Buksan ito sa bagong tab:",
    openInNewTab: "Buksan ang video call",
  },
  ceb: {
    appName: "Vantage",
    tagline: "Imong voice health assistant",
    chooseLanguage: "Pilia ang imong pinulongan",
    faceTitle: "Mag-sign in gamit ang Face ID",
    faceHint: "Tan-awa ang camera aron ma-verify",
    scanning: "Gi-scan ang imong nawong…",
    verified: "Na-verify",
    startCamera: "Sugdi ang Face ID",
    greeting: "Kumusta, unsa imong gibati karon? Sulti ug isulti ang imong mga simtomas.",
    you: "Ikaw",
    assistant: "Assistant",
    signOut: "Mag-sign out",
    dictatePlaceholder: "Sulti o i-type ang imong simtomas…",
    dictateHint: "Pindota ang imong Wispr Flow key ug sulti — dili na kinahanglan mag-type.",
    send: "Ipadala",
    thinking: "Naghunahuna…",
    callDoctor: "Tawag sa doktor",
    doctorCallTitle: "Live uban sa doktor",
    connectingDoctor: "Gikonektar ka sa usa ka doktor…",
    endCall: "Taposa ang tawag",
    doctorCallFallback: "Dili ma-load ang video call dinhi. Ablihi kini sa bag-ong tab:",
    openInNewTab: "Ablihi ang video call",
  },
  ilo: {
    appName: "Vantage",
    tagline: "Ti voice health assistant mo",
    chooseLanguage: "Piliem ti pagsasaom",
    faceTitle: "Mag-sign in babaen ti Face ID",
    faceHint: "Kitaem ti camera tapno ma-verify",
    scanning: "Ma-scan ti rupam…",
    verified: "Na-verify",
    startCamera: "Irugi ti Face ID",
    greeting: "Kumusta, ania ti marikriknam ita? Agsaoka ken ibagam dagiti sintomasmo.",
    you: "Sika",
    assistant: "Assistant",
    signOut: "Mag-sign out",
    dictatePlaceholder: "Agsao wenno ag-type kadagiti sintomas…",
    dictateHint: "Pindutem ti Wispr Flow key ket agsaoka — saanen a kasapulan ti ag-type.",
    send: "Ipatulod",
    thinking: "Agpampanunot…",
    callDoctor: "Awagan ti doktor",
    doctorCallTitle: "Live a kadua ti doktor",
    connectingDoctor: "Ikonektar ka iti maysa a doktor…",
    endCall: "Isardeng ti tawag",
    doctorCallFallback: "Saan a ma-load ti video call ditoy. Luktan iti baro a tab:",
    openInNewTab: "Luktan ti video call",
  },
  ms: {
    appName: "Vantage",
    tagline: "Pembantu kesihatan suara anda",
    chooseLanguage: "Pilih bahasa anda",
    faceTitle: "Log masuk dengan Face ID",
    faceHint: "Pandang kamera untuk pengesahan",
    scanning: "Mengimbas wajah anda…",
    verified: "Disahkan",
    startCamera: "Mulakan Face ID",
    greeting: "Hai, bagaimana perasaan anda hari ini? Bercakap dan beritahu saya gejala anda.",
    you: "Anda",
    assistant: "Pembantu",
    signOut: "Log keluar",
    dictatePlaceholder: "Bercakap atau taip gejala anda…",
    dictateHint: "Tekan kekunci Wispr Flow anda dan bercakap — tanpa menaip.",
    send: "Hantar",
    thinking: "Sedang berfikir…",
    callDoctor: "Panggil doktor",
    doctorCallTitle: "Live bersama doktor",
    connectingDoctor: "Menghubungkan anda dengan doktor…",
    endCall: "Tamatkan panggilan",
    doctorCallFallback: "Panggilan video tidak dapat dimuatkan di sini. Buka dalam tab baharu:",
    openInNewTab: "Buka panggilan video",
  },
  ta: {
    appName: "Vantage",
    tagline: "உங்கள் குரல் சுகாதார உதவியாளர்",
    chooseLanguage: "உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்",
    faceTitle: "Face ID மூலம் உள்நுழைக",
    faceHint: "சரிபார்க்க கேமராவைப் பாருங்கள்",
    scanning: "உங்கள் முகத்தை ஸ்கேன் செய்கிறது…",
    verified: "சரிபார்க்கப்பட்டது",
    startCamera: "Face ID ஐத் தொடங்கு",
    greeting: "வணக்கம், இன்று எப்படி உணருகிறீர்கள்? பேசி உங்கள் அறிகுறிகளைச் சொல்லுங்கள்.",
    you: "நீங்கள்",
    assistant: "உதவியாளர்",
    signOut: "வெளியேறு",
    dictatePlaceholder: "உங்கள் அறிகுறிகளைப் பேசவும் அல்லது தட்டச்சு செய்யவும்…",
    dictateHint: "உங்கள் Wispr Flow விசையை அழுத்திப் பேசுங்கள் — தட்டச்சு தேவையில்லை.",
    send: "அனுப்பு",
    thinking: "யோசிக்கிறது…",
    callDoctor: "மருத்துவரை அழைக்கவும்",
    doctorCallTitle: "மருத்துவருடன் நேரலை",
    connectingDoctor: "உங்களை மருத்துவருடன் இணைக்கிறது…",
    endCall: "அழைப்பை முடி",
    doctorCallFallback: "வீடியோ அழைப்பை இங்கே ஏற்ற முடியவில்லை. புதிய தாவலில் திறக்கவும்:",
    openInNewTab: "வீடியோ அழைப்பைத் திற",
  },
  th: {
    appName: "Vantage",
    tagline: "ผู้ช่วยสุขภาพด้วยเสียงของคุณ",
    chooseLanguage: "เลือกภาษาของคุณ",
    faceTitle: "เข้าสู่ระบบด้วย Face ID",
    faceHint: "มองที่กล้องเพื่อยืนยันตัวตน",
    scanning: "กำลังสแกนใบหน้าของคุณ…",
    verified: "ยืนยันแล้ว",
    startCamera: "เริ่ม Face ID",
    greeting: "สวัสดี วันนี้คุณรู้สึกอย่างไร? พูดและบอกอาการของคุณได้เลย",
    you: "คุณ",
    assistant: "ผู้ช่วย",
    signOut: "ออกจากระบบ",
    dictatePlaceholder: "พูดหรือพิมพ์อาการของคุณ…",
    dictateHint: "กดปุ่ม Wispr Flow ของคุณแล้วพูด — ไม่ต้องพิมพ์",
    send: "ส่ง",
    thinking: "กำลังคิด…",
    callDoctor: "โทรหาแพทย์",
    doctorCallTitle: "วิดีโอคอลกับแพทย์",
    connectingDoctor: "กำลังเชื่อมต่อคุณกับแพทย์…",
    endCall: "วางสาย",
    doctorCallFallback: "ไม่สามารถโหลดวิดีโอคอลที่นี่ได้ เปิดในแท็บใหม่:",
    openInNewTab: "เปิดวิดีโอคอล",
  },
  km: {
    appName: "Vantage",
    tagline: "ជំនួយការសុខភាពដោយសំឡេងរបស់អ្នក",
    chooseLanguage: "ជ្រើសរើសភាសារបស់អ្នក",
    faceTitle: "ចូលដោយប្រើ Face ID",
    faceHint: "សូមមើលកាមេរ៉ាដើម្បីផ្ទៀងផ្ទាត់",
    scanning: "កំពុងស្កេនមុខរបស់អ្នក…",
    verified: "បានផ្ទៀងផ្ទាត់",
    startCamera: "ចាប់ផ្តើម Face ID",
    greeting: "សួស្តី តើថ្ងៃនេះអ្នកមានអារម្មណ៍យ៉ាងណា? សូមនិយាយប្រាប់រោគសញ្ញារបស់អ្នក។",
    you: "អ្នក",
    assistant: "ជំនួយការ",
    signOut: "ចាកចេញ",
    dictatePlaceholder: "និយាយ ឬវាយបញ្ចូលរោគសញ្ញារបស់អ្នក…",
    dictateHint: "សង្កត់គ្រាប់ចុច Wispr Flow របស់អ្នក ហើយនិយាយ — មិនចាំបាច់វាយបញ្ចូលទេ។",
    send: "ផ្ញើ",
    thinking: "កំពុងគិត…",
    callDoctor: "ហៅវេជ្ជបណ្ឌិត",
    doctorCallTitle: "ផ្ទាល់ជាមួយវេជ្ជបណ្ឌិត",
    connectingDoctor: "កំពុងតភ្ជាប់អ្នកទៅវេជ្ជបណ្ឌិត…",
    endCall: "បញ្ចប់ការហៅ",
    doctorCallFallback: "មិនអាចផ្ទុកការហៅជាវីដេអូនៅទីនេះបានទេ។ បើកក្នុងផ្ទាំងថ្មី៖",
    openInNewTab: "បើកការហៅជាវីដេអូ",
  },
};

export function t(langCode: string, key: StringKey): string {
  return (STRINGS[langCode] ?? STRINGS.en)[key];
}

export function findLanguage(code: string): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
