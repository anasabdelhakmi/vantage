// Client for the Vantage agent backend.
//
// Contract (to be implemented by the backend team as a thin wrapper around
// vantage's `agent.ask(message: str) -> str`):
//
//   POST {VITE_API_BASE_URL}/api/chat
//   Request:  { "message": string, "lang": string, "sessionId"?: string, "patientId"?: string }
//   Response: { "reply": string, "escalate"?: boolean }
//
// `escalate` (optional, defaults to false) tells the frontend the case needs a
// remote doctor: when true the UI surfaces a "Call a doctor" video-call button.
//
// Voice INPUT is captured by Wispr Flow (system dictation) into a text field,
// so the backend always receives plain text. See docs/BACKEND_INTEGRATION.md.
//
// If VITE_API_BASE_URL is empty, we fall back to a local mock so the demo
// works with no backend running. The mock loosely mirrors the triage/restock
// behaviour described in the vantage repo.

export interface ChatRequest {
  message: string;
  lang: string;
  sessionId?: string;
  patientId?: string;
}

export interface ChatResponse {
  reply: string;
  escalate?: boolean;
}

/** What `sendMessage` returns to the UI: the spoken reply plus whether to
 *  offer a video call with a remote doctor. */
export interface AgentReply {
  reply: string;
  escalate: boolean;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";

export const usingMock = BASE_URL === "";

export async function sendMessage(req: ChatRequest): Promise<AgentReply> {
  if (usingMock) {
    return mockReply(req.message, req.lang);
  }

  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    throw new Error(`Backend error ${res.status}`);
  }

  const data = (await res.json()) as ChatResponse;
  return { reply: data.reply, escalate: data.escalate ?? false };
}

// ---------------------------------------------------------------------------
// Mock agent — offline, rule-based. Purely for demoing the frontend without
// the real backend. The real backend replaces this entirely.
// ---------------------------------------------------------------------------

const DANGER_WORDS = [
  "chest pain",
  "can't breathe",
  "cannot breathe",
  "unconscious",
  "bleeding",
  "seizure",
  "blood",
];

function mockReply(message: string, lang: string): Promise<AgentReply> {
  const m = message.toLowerCase();
  const copy = MOCK[lang] ?? MOCK.en;
  let reply: string;
  let escalate = false;

  if (DANGER_WORDS.some((w) => m.includes(w))) {
    reply = copy.danger;
    escalate = true; // dangerous symptoms → offer a video call with a doctor
  } else if (/(reorder|restock|order|supply|stock)/.test(m)) {
    reply = copy.restock;
  } else if (/(fever|headache|cough|cold|pain|ache|sick|vomit|diarr)/.test(m)) {
    reply = copy.triage;
  } else {
    reply = copy.clarify;
  }

  // Simulate network + model latency for a realistic demo feel.
  return new Promise((resolve) => setTimeout(() => resolve({ reply, escalate }), 700));
}

const MOCK: Record<string, { triage: string; danger: string; restock: string; clarify: string }> = {
  en: {
    triage:
      "This sounds like it could be a common viral infection (about 70% likely). How many days have you had these symptoms, and do you have a fever?",
    danger:
      "These symptoms can be serious. I'm connecting you to a remote doctor now — please stay calm and don't wait.",
    restock:
      "Based on rising demand, I'd suggest reordering paracetamol and oral rehydration salts this week before stock runs low.",
    clarify: "I want to help. Can you tell me a bit more about how you're feeling?",
  },
  fil: {
    triage:
      "Mukhang maaaring karaniwang viral infection ito (mga 70% na posibilidad). Ilang araw ka nang may ganitong sintomas, at may lagnat ka ba?",
    danger:
      "Maaaring seryoso ang mga sintomas na ito. Ikinokonekta na kita sa isang doktor ngayon — huwag mag-alala at huwag maghintay.",
    restock:
      "Dahil sa tumataas na pangangailangan, imumungkahi kong mag-order muli ng paracetamol at oral rehydration salts ngayong linggo bago maubos.",
    clarify: "Gusto kitang tulungan. Maaari mo bang sabihin nang kaunti pa ang nararamdaman mo?",
  },
  ceb: {
    triage:
      "Morag komon nga viral infection kini (mga 70% posible). Pila na ka adlaw nga naa kay ingon niini nga simtomas, ug naa ba kay hilanat?",
    danger:
      "Mahimong grabe kini nga mga simtomas. Gikonektar na tika sa doktor karon — ayaw kabalaka ug ayaw paghulat.",
    restock:
      "Tungod sa nagkadako nga panginahanglan, magsugyot ko nga mag-order pag-usab og paracetamol ug oral rehydration salts karong semanaha sa dili pa mahurot.",
    clarify: "Gusto tikang tabangan. Mahimo ka bang mosulti og dugang bahin sa imong gibati?",
  },
  ilo: {
    triage:
      "Kasla gagangay a viral infection daytoy (agarup 70%). Mano nga aldawen nga addaanka kadagitoy a sintomas, ken addaanka kadi iti gurigor?",
    danger:
      "Mabalin a nakaro dagitoy a sintomas. Ikonektak kenka ti doktor ita — saanka nga agdanag ken saanka nga aguray.",
    restock:
      "Gapu iti umad-adu a kasapulan, isingasingko ti panag-order manen iti paracetamol ken oral rehydration salts iti daytoy a lawas sakbay a maibus.",
    clarify: "Kayatka a tulongan. Mabalinmo kadi nga ibaga ti ad-adu maipapan iti marikriknam?",
  },
  ms: {
    triage:
      "Ini mungkin jangkitan virus biasa (kemungkinan sekitar 70%). Sudah berapa hari anda mengalami gejala ini, dan adakah anda demam?",
    danger:
      "Gejala ini boleh menjadi serius. Saya menghubungkan anda dengan doktor sekarang — sila bertenang dan jangan tunggu.",
    restock:
      "Berdasarkan permintaan yang meningkat, saya cadangkan pesan semula paracetamol dan garam rehidrasi oral minggu ini sebelum stok habis.",
    clarify: "Saya mahu membantu. Boleh anda ceritakan sedikit lagi tentang perasaan anda?",
  },
  ta: {
    triage:
      "இது ஒரு பொதுவான வைரஸ் தொற்றாக இருக்கலாம் (சுமார் 70% வாய்ப்பு). இந்த அறிகுறிகள் எத்தனை நாட்களாக உள்ளன, உங்களுக்கு காய்ச்சல் உள்ளதா?",
    danger:
      "இந்த அறிகுறிகள் தீவிரமாக இருக்கலாம். நான் இப்போது உங்களை மருத்துவரிடம் இணைக்கிறேன் — அமைதியாக இருங்கள், காத்திருக்க வேண்டாம்.",
    restock:
      "அதிகரிக்கும் தேவையின் அடிப்படையில், இந்த வாரம் இருப்பு தீர்வதற்கு முன் பாராசிட்டமால் மற்றும் ஓஆர்எஸ் உப்புகளை மீண்டும் ஆர்டர் செய்ய பரிந்துரைக்கிறேன்.",
    clarify: "நான் உதவ விரும்புகிறேன். நீங்கள் எப்படி உணருகிறீர்கள் என்பதைப் பற்றி இன்னும் கொஞ்சம் சொல்ல முடியுமா?",
  },
  th: {
    triage:
      "อาการนี้อาจเป็นการติดเชื้อไวรัสทั่วไป (โอกาสประมาณ 70%) คุณมีอาการนี้มากี่วันแล้ว และมีไข้หรือไม่?",
    danger: "อาการเหล่านี้อาจร้ายแรง ฉันกำลังต่อสายหาแพทย์ให้คุณตอนนี้ — โปรดใจเย็นและอย่ารอ",
    restock:
      "จากความต้องการที่เพิ่มขึ้น ฉันแนะนำให้สั่งพาราเซตามอลและเกลือแร่ ORS เพิ่มในสัปดาห์นี้ก่อนของจะหมด",
    clarify: "ฉันอยากช่วยคุณ คุณช่วยเล่าเพิ่มเติมเกี่ยวกับอาการของคุณได้ไหม?",
  },
  km: {
    triage:
      "នេះទំនងជាការឆ្លងមេរោគវីរុសធម្មតា (ប្រហែល ៧០%)។ តើអ្នកមានរោគសញ្ញាទាំងនេះប៉ុន្មានថ្ងៃហើយ ហើយអ្នកមានគ្រុនក្តៅទេ?",
    danger:
      "រោគសញ្ញាទាំងនេះអាចធ្ងន់ធ្ងរ។ ខ្ញុំកំពុងតភ្ជាប់អ្នកទៅវេជ្ជបណ្ឌិតឥឡូវនេះ — សូមរក្សាភាពស្ងប់ស្ងាត់ ហើយកុំរង់ចាំ។",
    restock:
      "ដោយផ្អែកលើតម្រូវការកើនឡើង ខ្ញុំសូមណែនាំឱ្យបញ្ជាទិញប៉ារ៉ាសេតាមុល និងអំបិល ORS ឡើងវិញនៅសប្តាហ៍នេះ មុនពេលអស់ស្តុក។",
    clarify: "ខ្ញុំចង់ជួយ។ តើអ្នកអាចប្រាប់ខ្ញុំបន្ថែមអំពីអារម្មណ៍របស់អ្នកបានទេ?",
  },
};
