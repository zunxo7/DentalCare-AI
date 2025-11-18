// server/botService.ts (streamlined & optimized)

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
    console.error("❌ Embedding error:", err);
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

// -------------------- MAIN BOT LOGIC --------------------

export const getBotResponse = async (
  userMessage: string,
  userName: string,
  faqs: FAQ[],
  media: Media[]
): Promise<BotResponse> => {
  console.log("\n🔍 Query:", userMessage.substring(0, 80) + (userMessage.length > 80 ? "..." : ""));
  
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
  
  // Roman Urdu keywords (actual Urdu transliterations only, not English words)
  const romanUrduKeywords = /\b(kaise|kese|kaisay|kaisey|kartay|karte|karein|karen|karna|karo|hai|hain|hoon|ho|aap|aapko|kya|kyu|kyun|kyunke|kis|kiun|daant|dant|kitni|kitne|dafa|dafah|baar|kab|kabhi|khana|khane|mein|main|ko|ka|ki|ke|saath|sath|par|pe|se|tak|liye|dena|deni|chahiye|chahie|jab|jis|yeh|ye|wo|woh|agar|lekin|aur)\b/i;
  
  // Count Roman Urdu matches vs English words
  const romanUrduMatches = (rawLower.match(romanUrduKeywords) || []).length;
  const totalWords = rawLower.split(/\s+/).length;
  
  // Only consider Roman Urdu if at least 30% of words are Roman Urdu keywords
  const isRomanUrdu = romanUrduMatches > 0 && (romanUrduMatches / totalWords) >= 0.3;

  let detectedLang: "english" | "urdu" | "roman" = "english";
  if (isUrduScript) detectedLang = "urdu";
  else if (isRomanUrdu) detectedLang = "roman";
  
  console.log("🌍 Language detected:", detectedLang === "english" ? "English" : detectedLang === "urdu" ? "Urdu (script)" : "Roman Urdu");

  const queryTokens = extractContentTokens(trimmed);
  console.log("📝 Query tokens:", queryTokens.join(", "));

  const SIGNIFICANT_BASE = detectedLang === "english" ? 0.25 : 0.15;
  
  // Detect question type
  const queryLower = trimmed.toLowerCase();
  const isWhatQuestion = /what (does|is|are)|function of|purpose of/i.test(queryLower);
  const isProblemQuestion = /pok|sharp|hurt|pain|fix|problem|issue/i.test(queryLower);
  
  // For very short queries, require higher threshold
  const wordCount = trimmed.split(/\s+/).length;
  const MIN_SCORE_THRESHOLD = wordCount < 3 ? 0.35 : (detectedLang === "english" ? 0.3 : 0.2);

  // User embedding (only one call)
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

    let combined =
      embScore > 0
        ? 0.6 * embScore + 0.3 * lexScore + 0.1 * kwScore
        : 0.7 * lexScore + 0.3 * kwScore;

    // Penalize mismatches between question type and FAQ type
    const faqLower = faq.question.toLowerCase() + " " + faq.answer.toLowerCase();
    const faqIsProblem = /pok|sharp|hurt|pain|fix|wax|irritat|loose|broken/i.test(faqLower);
    
    let wasPenalized = false;
    if (isWhatQuestion && faqIsProblem) {
      combined *= 0.1; // Heavy penalty: info question matched to problem FAQ
      wasPenalized = true;
    } else if (isProblemQuestion && !faqIsProblem) {
      combined *= 0.5; // Moderate penalty: problem question matched to info FAQ
      wasPenalized = true;
    }

    return {
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      keywords: faq.keywords ?? [],
      score: combined,
      embScore,
      lexScore,
      kwScore,
      wasPenalized,
    };
  });

  scoredFaqs.sort((a, b) => b.score - a.score);

  const best = scoredFaqs[0];
  
  if (isWhatQuestion) {
    console.log("🔍 Detected: INFORMATIONAL question (what/function/purpose)");
  } else if (isProblemQuestion) {
    console.log("🔍 Detected: PROBLEM question (poking/sharp/fix)");
  }
  
  let answerText: string;
  let faqId: number | null = null;
  let matchedFaq: typeof best | null = null;

  // Filter out penalized FAQs and those below threshold
  const validFaqs = scoredFaqs.filter(f => 
    !(f as any).wasPenalized && f.score >= MIN_SCORE_THRESHOLD
  );
  
  const topFaqs = validFaqs.slice(0, 3);
  
  if (topFaqs.length === 0 || (best && best.score < MIN_SCORE_THRESHOLD)) {
    console.log(`🤖 No valid FAQs (threshold: ${MIN_SCORE_THRESHOLD.toFixed(2)}, best score: ${best?.score.toFixed(3) || 'N/A'}), generating answer`);
    const answerCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: `You are an orthodontic clinic assistant. Answer in ${detectedLang}. Never mention media.` },
        { role: "user", content: `User: ${userName}\nQuestion: ${trimmed}` },
      ],
    });
    answerText = answerCompletion.choices[0]?.message?.content?.trim() ?? "";
  } else {
    console.log("🤖 LLM choosing from top 3 FAQs");
    
    const answerSystemPrompt = `You are an orthodontic FAQ selector. 
Analyze the user's question and select the MOST relevant FAQ from the list.
Return ONLY a JSON object: {"faq_id": <number>, "reason": "<short reason>"}

IMPORTANT RULES:
- If the question is a greeting ("hi", "hello", "hey") or asking about the bot itself ("what is your name", "who are you"), return {"faq_id": null, "reason": "Not an orthodontic question"}
- If NONE of the FAQs are relevant to the question, return {"faq_id": null, "reason": "No relevant FAQ"}
- Only select an FAQ if it DIRECTLY answers the user's question
- Context: This is POST-OPERATIVE (after getting braces/aligners/orthodontic treatment)
- "how brush" = how to brush WITH braces (not general brushing)
- User has orthodontic appliances unless stated otherwise
- Prioritize braces-specific FAQs over general dental FAQs`;

    const answerUserPayload = {
      user_question: trimmed,
      language: detectedLang,
      available_faqs: topFaqs.map(f => ({ 
        id: f.id, 
        question: f.question, 
        answer_preview: f.answer.substring(0, 200) + "...",
        score: f.score.toFixed(3)
      })),
    };

    const answerCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: answerSystemPrompt },
        { role: "user", content: JSON.stringify(answerUserPayload) },
      ],
    });

    const response = answerCompletion.choices[0]?.message?.content?.trim() ?? "{}";
    try {
      const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || "{}");
      faqId = parsed.faq_id;
      
      // If LLM says no FAQ is relevant, generate general answer
      if (faqId === null || faqId === undefined) {
        console.log("🤖 LLM determined no FAQ is relevant:", parsed.reason || "N/A");
        const answerCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            { role: "system", content: `You are an orthodontic clinic assistant. Answer in ${detectedLang}. Never mention media.` },
            { role: "user", content: `User: ${userName}\nQuestion: ${trimmed}` },
          ],
        });
        answerText = answerCompletion.choices[0]?.message?.content?.trim() ?? "";
      } else {
        const selectedFaq = topFaqs.find(f => f.id === faqId);
        
        if (selectedFaq) {
          matchedFaq = selectedFaq;
          answerText = selectedFaq.answer;
          console.log("✅ LLM selected FAQ:", faqId, "| Reason:", parsed.reason || "N/A");
          console.log("   Q:", selectedFaq.question.substring(0, 60) + "...");
        } else {
          // Fallback: generate general answer if LLM selected invalid FAQ
          console.log("⚠️ LLM selected invalid FAQ, generating answer");
          const answerCompletion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.2,
            messages: [
              { role: "system", content: `You are an orthodontic clinic assistant. Answer in ${detectedLang}. Never mention media.` },
              { role: "user", content: `User: ${userName}\nQuestion: ${trimmed}` },
            ],
          });
          answerText = answerCompletion.choices[0]?.message?.content?.trim() ?? "";
        }
      }
    } catch {
      // On parse error, generate general answer instead of using wrong FAQ
      console.log("⚠️ Parse error, generating answer");
      const answerCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: `You are an orthodontic clinic assistant. Answer in ${detectedLang}. Never mention media.` },
          { role: "user", content: `User: ${userName}\nQuestion: ${trimmed}` },
        ],
      });
      answerText = answerCompletion.choices[0]?.message?.content?.trim() ?? "";
    }
  }

  // -------------------- LLM MEDIA SELECTION --------------------
  // Do media selection BEFORE translation (using English answer for accurate matching)
  const englishAnswerForMedia = answerText;
  let selectedMediaUrls: string[] = [];

  if (media.length > 0) {
    const mediaPrompt = `Analyze the user's question type FIRST, then decide media.

User question: "${trimmed}"
Full answer: "${englishAnswerForMedia}"

Media:
${media.map(m => `ID: ${m.id}, Title: "${m.title}", Type: ${m.type}`).join('\n')}

CRITICAL RULES (CHECK QUESTION TYPE FIRST):
1. Question asks "HOW OFTEN" / "WHEN" / frequency → NEVER attach technique videos (return [])
2. Question asks "HOW TO" / "HOW DO I" → attach technique videos if mentioned in answer
3. Question asks "WHAT DOES X DO" / "PURPOSE OF" → attach diagrams/explanations only
4. Question about PROBLEMS (pain, poking, loose, broken) → ONLY attach relevant problem-solving videos

THEN check answer content:
- Answer mentions "interproximal brush" AND question is "how to" → attach interproximal video
- Answer mentions "brush" AND question is "how to" → attach brushing video
- Answer mentions "wax" AND question is technique → attach wax video
- Answer describes parts/components → attach diagram/explanation

EXAMPLES:
- "How often should I brush?" → [] (frequency question, NO videos)
- "How to brush with braces?" → [brush videos] (technique question)
- "What does a wire do?" → [diagram] (informational, NO technique videos)
- "Do braces cause pain?" → [] (NO technique videos for pain questions)

Return JSON array: [id1, id2, ...] or []`;

    try {
      const mediaCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: "You are a strict media filter. FIRST check question type. 'HOW OFTEN' questions get NO videos. 'HOW TO' questions get technique videos. Return ONLY relevant media IDs as JSON array." },
          { role: "user", content: mediaPrompt },
        ],
      });

      const mediaResponse = mediaCompletion.choices[0]?.message?.content?.trim() || "[]";
      const selectedIds = JSON.parse(mediaResponse.match(/\[[\d,\s]*\]/)?.[0] || "[]");
      selectedMediaUrls = media.filter(m => selectedIds.includes(m.id)).map(m => m.url);
      
      console.log("🎬 Media attached:", selectedMediaUrls.length);
      if (selectedMediaUrls.length > 0) {
        media.filter(m => selectedIds.includes(m.id)).forEach(m => {
          console.log("   -", m.title);
        });
      }
    } catch (err) {
      console.error("❌ Media selection error:", err);
    }
  }

  // -------------------- TRANSLATION IF NEEDED (AFTER MEDIA) --------------------
  if (detectedLang !== "english") {
    console.log("🌐 Translating answer to:", detectedLang === "urdu" ? "Urdu script" : "Roman Urdu");
    
    const targetLanguage = detectedLang === "urdu" 
      ? "Urdu (اردو script)" 
      : "Roman Urdu (Urdu written in English letters like 'kaise', 'kartay')";
    
    try {
      const translationCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages: [
          { 
            role: "system", 
            content: `You are a professional translator. Translate the orthodontic FAQ answer to ${targetLanguage}. Maintain all medical terms accuracy. Return ONLY the translation.` 
          },
          { 
            role: "user", 
            content: `Translate this to ${targetLanguage}:\n\n${answerText}` 
          },
        ],
      });

      const translatedText = translationCompletion.choices[0]?.message?.content?.trim();
      if (translatedText) {
        answerText = translatedText;
        console.log("✅ Answer translated to", detectedLang);
      }
    } catch (err) {
      console.error("❌ Translation error:", err);
      console.log("⚠️ Using original English answer");
    }
  }

  return {
    text: answerText,
    mediaUrls: selectedMediaUrls,
    faqId,
  };
};