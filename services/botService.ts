// server/botService.ts — CLEAN FIXED VERSION

import OpenAI from "openai";
import type { FAQ, Media } from "../types";

export interface BotResponse {
  text: string;
  mediaUrls: string[];
  faqId: number | null;
  queryId: string | null;
}

// -------------------- CONSTANTS --------------------
const LOOSE_BRACKET_FAQ_ID = 3;

const MEDIA_IDS = {
  BRUSH_TEETH: 1,
  POKING_WIRE: 2,
  INTERDENTAL_BRUSH: 3,
  WAX: 4,
  PARTS_EXPLANATION: 5,
  PARTS_DIAGRAM: 6,
} as const;

// -------------------- LOGGING HELPER --------------------
function logToServer(
  level: "log" | "error" | "warn" | "info",
  message: string,
  queryId: string | null,
  userId?: string | null
) {
  // Log to console immediately
  console[level === "log" ? "log" : level](message);

  // Send to server asynchronously (don't wait, don't block)
  fetch("/api/debug/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, queryId, userId: userId || null }),
  }).catch(() => {
    // Silently fail if server is unavailable
  });
}

// -------------------- OPENAI CLIENT --------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  dangerouslyAllowBrowser: true,
});

// -------------------- EMBEDDINGS --------------------
async function embed(text: string): Promise<number[]> {
  try {
    const out = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return out.data[0]?.embedding ?? [];
  } catch {
    return [];
  }
}

function cosine(a: number[], b: number[]) {
  let dot = 0,
    na = 0,
    nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] ** 2;
    nb += b[i] ** 2;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// -------------------- NORMALIZATION --------------------
const STOP = new Set([
  "how",
  "what",
  "why",
  "when",
  "where",
  "who",
  "does",
  "do",
  "did",
  "is",
  "are",
  "can",
  "could",
  "should",
  "the",
  "a",
  "an",
  "of",
  "in",
  "on",
  "for",
  "with",
  "to",
  "from",
  "about",
  "your",
  "my",
  "me",
  "you",
  "i",
]);

function normalize(t: string) {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(t: string) {
  return normalize(t)
    .split(" ")
    .filter((x) => x && !STOP.has(x));
}

// -------------------- SPECIAL QUERY HELPERS --------------------
function isBrushingTechniqueQuery(q: string): boolean {
  const n = normalize(q);
  if (!n.includes("brush")) return false;
  // catch "how brush", "how to brush", "brush teeth", etc.
  if (n.includes("how brush")) return true;
  if (n.includes("brush teeth")) return true;
  if (n.includes("brush with braces")) return true;
  if (n.includes("brush teeth with braces")) return true;
  return false;
}

function isBracesPartsQuery(q: string): boolean {
  const n = normalize(q);
  if (n.includes("parts of braces")) return true;
  if (n.includes("braces parts")) return true;
  if (n.includes("braces parts diagram")) return true;
  if (n.includes("functions of braces")) return true;
  if (n.includes("function of braces")) return true;
  if (n.includes("what does a wire do")) return true;
  if (n.includes("what does the wire do")) return true;
  if (n.includes("braces parts explanation")) return true;
  if (n.includes("name the parts of braces")) return true;
  return false;
}

// -------------------- MAIN --------------------
export async function getBotResponse(
  msg: string,
  userName: string,
  faqs: FAQ[],
  media: Media[],
  userId?: string | null
): Promise<BotResponse> {
  // Generate unique query ID for this query session
  const queryId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

  // Collect all FAQ information for single log entry
  const faqLogData: any = {
    query: msg.trim(),
    language: null,
    queryType: null,
    englishQuery: null,
    queryTokens: null,
    top3FAQs: [],
    selectedFAQ: null,
    selectedFAQReason: null,
    mediaIds: [],
    mediaTitles: [],
    answer: null,
    translated: false,
  };

  const trimmed = msg.trim();
  if (!trimmed) {
    return {
      text: "براہ کرم اپنا سوال واضح طریقے سے لکھیں۔",
      mediaUrls: [],
      faqId: null,
      queryId: queryId,
    };
  }

  // ---------------- LAYER 1: LANGUAGE + TYPE ----------------
  let lang = "english";
  let type = "orthodontic";

  try {
    const detect = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Return ONLY this JSON:
{"language":"english"|"urdu"|"roman",
 "type":"greeting"|"bot_name"|"user_name"|"orthodontic"|"irrelevant"}

Rules:
- ANY question about teeth, brushing, cleaning, flossing, wax, wires, brackets,
  retainers, rubber bands, aligners, pain, poking wires, brushing frequency,
  dental hygiene, braces adjustments, food, eating, drinking, or food restrictions
  MUST be labeled "orthodontic".
- Treat brushing as orthodontic.
- Treat wax/poking wire as orthodontic.
- Treat "how often do I brush" as orthodontic.
- Treat "how do I use wax" as orthodontic.
- Treat ANY question about water flossers / waterpik / "water flosser" / "water pick" as orthodontic.
- Treat ANY question about food, eating, drinking, chocolate, candy, snacks, or what to eat/avoid with braces as orthodontic.

Roman Urdu words:
kitne, kaise, karte, hai, chahiye, baar, din, mai, mein, aap, kyu, kya, ko, ki, ke, par, pe, se, tak, liye, dena, deni, jab, jis, yeh, ye, wo, agar, lekin, aur.
`,
        },
        { role: "user", content: trimmed },
      ],
    });

    const parsed = JSON.parse(detect.choices[0].message.content || "{}");

    lang = parsed.language || "english";
    type = parsed.type || "orthodontic";

    faqLogData.language = lang;
    faqLogData.queryType = type;
  } catch {}

  // EARLY RETURNS
  if (type === "greeting") {
    const response = {
      text:
        lang === "english"
          ? "Hello! How can I help you with braces today?"
          : lang === "urdu"
          ? "ہیلو! میں بریسز کے متعلق کیسے مدد کر سکتا ہوں؟"
          : "Hello! Main braces ke baare mein kaise madad karoon?",
      mediaUrls: [],
      faqId: null,
      queryId: queryId,
    };
    faqLogData.answer = response.text;
    faqLogData.selectedFAQ = null;
    logToServer("log", `[FAQ] ${JSON.stringify(faqLogData)}`, queryId, userId);
    return response;
  }

  if (type === "bot_name") {
    const response = {
      text:
        lang === "english"
          ? "My name is DentalClinic AI."
          : lang === "urdu"
          ? "میرا نام DentalClinic AI ہے۔"
          : "Mera naam DentalClinic AI hai.",
      mediaUrls: [],
      faqId: null,
      queryId: queryId,
    };
    faqLogData.answer = response.text;
    faqLogData.selectedFAQ = null;
    logToServer("log", `[FAQ] ${JSON.stringify(faqLogData)}`, queryId, userId);
    return response;
  }

  if (type === "user_name") {
    const response = {
      text: `Your name is ${userName}.`,
      mediaUrls: [],
      faqId: null,
      queryId: queryId,
    };
    faqLogData.answer = response.text;
    faqLogData.selectedFAQ = null;
    logToServer("log", `[FAQ] ${JSON.stringify(faqLogData)}`, queryId, userId);
    return response;
  }

  if (type === "irrelevant") {
    const response = {
      text:
        lang === "english"
          ? "I can only answer orthodontic questions — such as braces care, brushing, wax, poking wires, aligners, pain, food restrictions, dental hygiene, and tools like water flossers. Please ask something related to orthodontics."
          : lang === "urdu"
          ? "میں صرف آرتھو ڈونٹکس سے متعلق سوالات کا جواب دے سکتا ہوں — جیسے بریسز کی دیکھ بھال، برش کرنا، ویکس لگانا، چبھتی ہوئی تار، الائنرز، درد، کھانے کی پابندیاں، دانتوں کی صفائی اور واٹر فلاسسر وغیرہ۔ براہ کرم آرتھوڈونٹکس سے متعلق سوال پوچھیں۔"
          : "Main sirf orthodontic sawalat ka jawab de sakta hoon — jaise braces care, brushing, wax, poking wire, aligners, pain, food restrictions, dental hygiene aur water flosser jaisay tools. Barah-e-karam orthodontics se related sawal poochain.",
      mediaUrls: [],
      faqId: null,
      queryId: queryId,
    };
    faqLogData.answer = response.text;
    faqLogData.selectedFAQ = null;
    logToServer("log", `[FAQ] ${JSON.stringify(faqLogData)}`, queryId, userId);
    return response;
  }

  // ---------------- LAYER 1B: TRANSLATION TO ENGLISH ----------------
  let englishQuery = trimmed;

  if (lang !== "english") {
    const t = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Translate to English only." },
        { role: "user", content: trimmed },
      ],
    });
    englishQuery = t.choices[0].message.content?.trim() || trimmed;
    faqLogData.englishQuery = englishQuery;
    faqLogData.translated = true;
  } else {
    faqLogData.englishQuery = trimmed;
    faqLogData.translated = false;
  }

  const bracesPartsQuery = isBracesPartsQuery(englishQuery);
  const brushingTechniqueQuery = isBrushingTechniqueQuery(englishQuery);

  // ---------------- LAYER 2: FAQ HYBRID RANKING ----------------
  const queryEmbed = await embed(englishQuery);
  const qTokens = tokens(englishQuery);

  faqLogData.queryTokens = qTokens;

  const ranked = faqs
    .map((f) => {
      const emb = (f as any).embedding || [];
      const eScore =
        queryEmbed.length && emb.length ? cosine(queryEmbed, emb) : 0;
      const lScore = normalize(englishQuery) === normalize(f.question) ? 1 : 0;

      return {
        ...f,
        score: 0.7 * eScore + 0.3 * lScore,
      };
    })
    .sort((a, b) => b.score - a.score);

  const top3 = ranked.slice(0, 3);

  faqLogData.top3FAQs = top3.map((f) => ({
    id: f.id,
    question: f.question,
    score: f.score.toFixed(3),
  }));

  // ---------------- LAYER 3: FAQ PICKER (WITH SPECIAL RULES) ----------------
  let finalAnswer = "";
  let finalFaqId: number | null = null;
  let selectorReason = "";

  // 3A: FORCE BRUSHING TECHNIQUE FAQ WHEN POSSIBLE
  if (brushingTechniqueQuery) {
    const brushingFaq = top3.find((f) =>
      normalize(f.question).includes("brush teeth with braces")
    );
    if (brushingFaq) {
      finalFaqId = brushingFaq.id;
      finalAnswer = brushingFaq.answer;
      selectorReason =
        "Query is about how to brush; forced 'How do I brush teeth with braces?' FAQ.";
    }
  }

  // 3B: BRACES PARTS QUESTIONS → ALWAYS LLM ANSWER (NO FAQ)
  if (!finalFaqId && bracesPartsQuery) {
    const gen = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an orthodontic assistant. Explain clearly the different parts of braces (brackets, wires, bands, ligatures, etc.) and what each part does, in simple language.",
        },
        { role: "user", content: englishQuery },
      ],
    });
    finalAnswer = gen.choices[0].message.content || "";
    finalFaqId = null;
    selectorReason =
      "Braces parts / wire function question answered directly by LLM (no matching FAQ).";
  }

  // 3C: NORMAL LLM FAQ PICKER
  if (!finalFaqId && !bracesPartsQuery) {
    const selector = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Pick the best FAQ. Return JSON: {"faq_id": <id>|null, "reason": "..."}`,
        },
        {
          role: "user",
          content: JSON.stringify({
            query: englishQuery,
            faqs: top3.map((f) => ({ id: f.id, q: f.question, a: f.answer })),
          }),
        },
      ],
    });

    const picked = JSON.parse(
      selector.choices[0].message.content || '{"faq_id":null,"reason":""}'
    );

    if (picked.faq_id) {
      finalFaqId = picked.faq_id;
      finalAnswer = faqs.find((f) => f.id === finalFaqId)?.answer || "";
      const selectedFaq = faqs.find((f) => f.id === finalFaqId);
      faqLogData.selectedFAQ = {
        id: finalFaqId,
        question: selectedFaq?.question || "",
        answer: finalAnswer,
      };
      selectorReason = picked.reason || "N/A";
    } else {
      faqLogData.selectedFAQ = null;
      selectorReason = picked.reason || "N/A";
      const gen = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Orthodontic assistant. Answer clearly." },
          { role: "user", content: englishQuery },
        ],
      });
      finalAnswer = gen.choices[0].message.content || "";
      finalFaqId = null;
    }
  }

  if (finalFaqId) {
    const selectedFaq = faqs.find((f) => f.id === finalFaqId);
    faqLogData.selectedFAQ = {
      id: finalFaqId,
      question: selectedFaq?.question || "",
      answer: finalAnswer,
    };
  } else if (!faqLogData.selectedFAQ) {
    faqLogData.selectedFAQ = null;
  }
  faqLogData.selectedFAQReason = selectorReason || "N/A";

  // ---------------------------------------------------------
  // -------------------- UPDATED MEDIA LOGIC ----------------
  // ---------------------------------------------------------
  let selectedMedia: string[] = [];

  if (media.length > 0) {
    // SPECIAL CASE 1: BRACES PARTS QUESTIONS → FORCE DIAGRAM + EXPLANATION
    if (bracesPartsQuery) {
      const chosen = media.filter(
        (m) =>
          m.id === MEDIA_IDS.PARTS_EXPLANATION ||
          m.id === MEDIA_IDS.PARTS_DIAGRAM
      );
      selectedMedia = chosen.map((m) => m.url);
      faqLogData.mediaIds = chosen.map((m) => m.id);
      faqLogData.mediaTitles = chosen.map((m) => m.title);
    }
    // SPECIAL CASE 2: BRUSHING TECHNIQUE QUERIES → ALWAYS BOTH BRUSHING VIDEOS
    else if (brushingTechniqueQuery) {
      const chosen = media.filter(
        (m) =>
          m.id === MEDIA_IDS.BRUSH_TEETH || m.id === MEDIA_IDS.INTERDENTAL_BRUSH
      );
      selectedMedia = chosen.map((m) => m.url);
      faqLogData.mediaIds = chosen.map((m) => m.id);
      faqLogData.mediaTitles = chosen.map((m) => m.title);
    }
    // SPECIAL CASE 3: LOOSE BRACKET/WIRE FAQ → ONLY WAX + POKING WIRE
    else if (finalFaqId === LOOSE_BRACKET_FAQ_ID) {
      const chosen = media.filter(
        (m) =>
          m.id === MEDIA_IDS.POKING_WIRE || m.id === MEDIA_IDS.WAX
      );
      selectedMedia = chosen.map((m) => m.url);
      faqLogData.mediaIds = chosen.map((m) => m.id);
      faqLogData.mediaTitles = chosen.map((m) => m.title);
    }
    // GENERAL MEDIA SELECTION VIA LLM
    else {
      const mSel = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
Select the MOST relevant media for the user query.

Media IDs:
1 = How to Brush Teeth With Braces
2 = How to Fix a Sharp or Poking Orthodontic Wire
3 = How to Use an Interdental Brush With Braces
4 = How to Use Dental Wax on Braces
5 = Braces Parts Explanation
6 = Braces Parts Diagram

Rules:
- BRUSHING, CLEANING, HYGIENE → select ID 1 (How to Brush Teeth With Braces) and/or ID 3 (Interdental Brush).
- INTERDENTAL BRUSH → select ID 3.
- WAX, POKING WIRE, SHARP WIRE → select ID 2 (poking wire video) and ID 4 (wax video).
- BRACES PARTS, FUNCTIONS OF BRACES PARTS → select ID 5 and ID 6.
- HOW OFTEN (frequency-only questions) → NO media.
- PAIN questions → NO media.

Return ONLY a JSON array of media IDs. Example:
[1,3]
`,
          },
          {
            role: "user",
            content: JSON.stringify({
              query: englishQuery,
              faqId: finalFaqId,
              media: media.map((m) => ({
                id: m.id,
                title: m.title,
              })),
            }),
          },
        ],
      });

      try {
        const ids: number[] = JSON.parse(
          mSel.choices[0].message.content || "[]"
        );
        const chosen = media.filter((x) => ids.includes(x.id));
        selectedMedia = chosen.map((x) => x.url);
        faqLogData.mediaIds = chosen.map((m) => m.id);
        faqLogData.mediaTitles = chosen.map((m) => m.title);
      } catch (e) {
        logToServer(
          "error",
          `[ERROR] Media parse error: ${e}`,
          queryId,
          userId
        );
      }
    }
  }

  // ---------------- LAYER 5: TRANSLATE FINAL ANSWER ----------------
  if (lang !== "english") {
    const tr = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            lang === "urdu"
              ? "Translate into Urdu script."
              : "Translate into Roman Urdu (English letters).",
        },
        { role: "user", content: finalAnswer },
      ],
    });

    finalAnswer = tr.choices[0].message.content || finalAnswer;
  }

  // Store all FAQ information in a single log entry
  faqLogData.answer = finalAnswer;
  logToServer("log", `[FAQ] ${JSON.stringify(faqLogData)}`, queryId, userId);

  return {
    text: finalAnswer,
    mediaUrls: selectedMedia,
    faqId: finalFaqId,
    queryId: queryId,
  };
}