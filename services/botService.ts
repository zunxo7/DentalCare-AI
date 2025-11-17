// server/botService.ts (updated with advanced media scoring)

import OpenAI from "openai";
import type { FAQ, Media } from "../types";

export interface BotResponse {
  text: string;
  mediaUrls: string[];
  faqId: number | null;
}

// -------------------- OPENAI CLIENT (BACKEND) --------------------

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  dangerouslyAllowBrowser: true
});

// -------------------- EMBEDDINGS --------------------

async function fetchEmbeddingSmall(text: string): Promise<number[]> {
  try {
    const res: any = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    const first = res?.data?.[0];
    if (first && Array.isArray(first.embedding)) return first.embedding;
    if (res?.data?.[0]?.embedding) return res.data[0].embedding;
  } catch (err) {
    console.error("Embedding error:", err);
  }
  return [];
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// -------------------- TEXT NORMALIZATION / TOKENS --------------------

const normalizeForSimilarity = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toTokenSet = (text: string) =>
  new Set<string>(text.split(/\s+/).filter(Boolean));

function similarityScore(a: string, b: string): number {
  const A = toTokenSet(normalizeForSimilarity(a));
  const B = toTokenSet(normalizeForSimilarity(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(A.size, B.size);
}

const STOPWORDS = new Set([
  "how","what","why","when","where","who","does","do","did",
  "is","are","can","could","should","the","a","an","of",
  "in","on","for","with","to","from","about","your","my","me",
  "you","i","teeth","tooth","dental","orthodontic","clinic","braces",
]);

function extractContentTokens(text: string): string[] {
  const norm = normalizeForSimilarity(text);
  return norm.split(/\s+/).filter((t) => t && !STOPWORDS.has(t));
}

function keywordOverlapScore(
  queryTokens: string[],
  keywordList: string[] | undefined | null
): number {
  if (!keywordList || keywordList.length === 0 || queryTokens.length === 0)
    return 0;

  const querySet = new Set(queryTokens);

  const keywordSet = new Set(
    keywordList
      .map((k) => normalizeForSimilarity(k))
      .join(" ")
      .split(/\s+/)
      .filter((t) => t && !STOPWORDS.has(t))
  );

  if (keywordSet.size === 0) return 0;

  let inter = 0;
  for (const k of keywordSet) if (querySet.has(k)) inter++;

  return inter / keywordSet.size; // 0..1
}

// -------------------- ADVANCED MEDIA MATCHING --------------------

// ✔️ Safe fuzzy keyword matching
const matchesMediaContext = (contextText: string, mediaItem: Media) => {
  const tokens =
    mediaItem.keywords
      ?.map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean) ?? [];

  if (tokens.length === 0) return false;

  const lowerContext = contextText.toLowerCase();

  return tokens.some((token) => {
    const words = token.split(/\s+/).filter(Boolean);
    return words.every((w) => lowerContext.includes(w));
  });
};

// ✔️ SEMANTIC MEDIA SCORING (embeddings + keyword weights)
async function scoreMediaCandidateAdvanced(
  question: string,
  answer: string,
  mediaItem: Media,
  queryEmbedding: number[]
): Promise<number> {
  let score = 0;

  const ctxText = `${question} ${answer}`;
  const ctxTokens = extractContentTokens(ctxText);
  const mediaKw = mediaItem.keywords ?? [];

  // 1) Keyword relevance (strong weight)
  const kwScore = keywordOverlapScore(ctxTokens, mediaKw);
  score += kwScore * 6;

  // 2) Semantic similarity using embeddings
  const mediaText = `${mediaItem.title} ${(mediaItem.keywords ?? []).join(" ")}`;
  const mediaEmbedding = await fetchEmbeddingSmall(mediaText);

  if (mediaEmbedding.length) {
    const semanticScore = cosineSimilarity(queryEmbedding, mediaEmbedding);
    score += semanticScore * 4; // good weight
  }

  // 3) Manual boosts for high-value matches
  const ctx = ctxText.toLowerCase();
  const title = (mediaItem.title || "").toLowerCase();

  const boost = (cond: boolean, amount: number) => {
    if (cond) score += amount;
  };

  boost(ctx.includes("poking") || ctx.includes("sharp wire"), 4);
  boost(title.includes("poking") || title.includes("sharp"), 3);

  boost(ctx.includes("wax") || ctx.includes("irritation"), 4);
  boost(title.includes("wax"), 3);

  boost(ctx.includes("brush") || ctx.includes("brushing"), 3);
  boost(title.includes("brush"), 2);

  boost(ctx.includes("elastic") || ctx.includes("rubber band"), 4);
  boost(title.includes("elastic"), 3);

  return score;
}

// -------------------- MAIN BOT LOGIC --------------------

export const getBotResponse = async (
  userMessage: string,
  userName: string,
  faqs: FAQ[],
  media: Media[]
): Promise<BotResponse> => {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return {
      text: "براہ کرم اپنا سوال واضح الفاظ میں لکھیں تاکہ میں بہتر مدد کر سکوں۔",
      mediaUrls: [],
      faqId: null,
    };
  }

  // Language detection
  const rawLower = userMessage.toLowerCase();
  const isUrduScript = /[اأإآبتثجحخدذرزسشصضطظعغفقكلمنهوىي]/.test(rawLower);
  const isRomanUrdu = /\b(kaise|kese|kartay|karte|hai|hain|aap|kya|kyu|kis|brsh|daant|kitni|dafa|kab|khana)\b/i.test(rawLower);

  let detectedLang: "english" | "urdu" | "roman" = "english";
  if (isUrduScript) detectedLang = "urdu";
  else if (isRomanUrdu) detectedLang = "roman";

  const queryTokens = extractContentTokens(trimmed);
  const SIGNIFICANT_BASE = detectedLang === "english" ? 0.35 : 0.18;

  // User embedding
  const userEmbed = await fetchEmbeddingSmall(trimmed);

  // FAQ scoring
  const scoredFaqs = faqs.map((faq) => {
    const faqEmbed: number[] =
      (faq as any).embedding ?? (faq as any).embeddings ?? [];

    const embScore =
      userEmbed.length && faqEmbed.length
        ? cosineSimilarity(userEmbed, faqEmbed)
        : 0;

    const lexScore = similarityScore(trimmed, faq.question);
    const kwScore = keywordOverlapScore(queryTokens, (faq as any).keywords);

    const combined =
      embScore > 0
        ? 0.6 * embScore + 0.25 * lexScore + 0.15 * kwScore
        : 0.7 * lexScore + 0.3 * kwScore;

    return {
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      keywords: faq.keywords ?? [],
      score: combined,
      embScore,
      lexScore,
      kwScore,
    };
  });

  scoredFaqs.sort((a, b) => b.score - a.score);

  const topFaqs = scoredFaqs.slice(0, 3);
  const best = topFaqs[0];
  let threshold = SIGNIFICANT_BASE;
  if (best && best.kwScore >= 0.5) threshold -= 0.05;
  if (threshold < 0.1) threshold = 0.1;

  const hasGoodFaq = best && best.score >= threshold;
  const faqMatchesForModel = hasGoodFaq ? topFaqs : [];

  // LLM answering
  const answerSystemPrompt = `
You are an orthodontic clinic assistant.
Use ONLY the provided FAQ list if relevant.
Prefix final answer with [FAQ_ID:<id>] if using a specific FAQ.
Language: ${detectedLang}. Respond ONLY in this language.
Never mention media.
`.trim();

  const answerUserPayload = {
    user_message: trimmed,
    user_profile: { name: userName },
    faq_candidates: faqMatchesForModel,
  };

  const answerCompletion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: answerSystemPrompt },
      { role: "user", content: JSON.stringify(answerUserPayload) },
    ],
  });

  let answerText =
    answerCompletion.choices[0]?.message?.content?.trim() ?? "";
  let faqId: number | null = null;

  const faqIdMatch = answerText.match(/\[FAQ_ID:(\d+)\]/);
  if (faqIdMatch) {
    faqId = parseInt(faqIdMatch[1]);
    answerText = answerText.replace(/\[FAQ_ID:\d+\]/, "").trim();
  }

  // -------------------- ADVANCED MEDIA SELECTION --------------------

  // Score each media (semantic + keyword)
  const scoredMedia = await Promise.all(
    media.map(async (m) => {
      const score = await scoreMediaCandidateAdvanced(
        trimmed,
        answerText,
        m,
        userEmbed
      );
      return { media: m, score };
    })
  );

  scoredMedia.sort((a, b) => b.score - a.score);

  const topMedia = scoredMedia.filter((x) => x.score >= 2).slice(0, 4);

  // Convert to URLs
  let selectedMediaUrls = topMedia.map((x) => x.media.url);

  // Final soft context check (fuzzy)
  selectedMediaUrls = selectedMediaUrls.filter((url) => {
    const mediaItem = media.find((m) => m.url === url);
    return mediaItem ? matchesMediaContext(trimmed, mediaItem) : false;
  });

  return {
    text: answerText,
    mediaUrls: selectedMediaUrls,
    faqId,
  };
};