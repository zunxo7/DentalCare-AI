// Vercel Edge Function: Chat/Bot endpoint
// Keeps OpenAI API key server-side

import { createClient } from '@libsql/client';
import OpenAI from 'openai';
import * as dbHelpers from '../lib/dbHelpers';

import { SuggestionChip } from '../types';

export const config = { runtime: 'edge' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BotRequest {
  message: string;
  userName: string;
  userId?: string | null;
  suggestionFaqId?: number;
}

interface BotResponse {
  text: string;
  mediaUrls: string[];
  faqId: number | null;
  queryId: string | null;
  pipelineLogs?: string[];
  suggestions?: SuggestionChip[];
}

// Helper functions
function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

function isValidInput(text: string, maxLength: number): boolean {
  return text.length > 0 && text.length <= maxLength;
}

function truncateText(text: string, maxLength: number): string {
  return text.slice(0, maxLength);
}

function detectLanguage(text: string): 'english' | 'urdu' | 'roman' {
  if (!text || typeof text !== 'string') return 'english';

  // Check for Urdu script (Unicode range 0600-06FF)
  if (/[\u0600-\u06FF]/.test(text)) return 'urdu';

  // Check for Roman Urdu keywords
  const romanUrduKeywords = ['kaise', 'kya', 'kyu', 'hai', 'hain', 'chahiye', 'kitne', 'mein', 'aap', 'ko', 'ki', 'ke'];
  const normalized = text.toLowerCase();
  const keywordCount = romanUrduKeywords.filter(kw => new RegExp(`\\b${kw}\\b`, 'i').test(normalized)).length;
  if (keywordCount >= 2) return 'roman';

  return 'english';
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Rewrites user query into a canonical intent phrase.
 * This normalizes infinite phrasing into finite meaning.
 * 
 * Rules:
 * - English only
 * - 3-6 words
 * - No punctuation
 * - No filler words
 * - One clear meaning
 */
async function rewriteToCanonicalIntent(englishQuery: string, openai: OpenAI): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Rewrite the user's orthodontic question into a short canonical intent phrase.

Rules:
- English only
- 3-6 words maximum
- No punctuation
- No filler words (like "how", "what", "please")
- One clear meaning
- Use standard orthodontic terminology

Examples:
- "my wire stabbing me" → "braces wire poking cheek"
- "taar gaal mein chubh rahi" → "braces wire poking cheek"
- "metal cutting mouth" → "braces wire irritating mouth"
- "how clean braces" → "brushing braces properly"
- "when see orthodontist" → "orthodontist appointment frequency"
- "bracket came off" → "bracket detached loose"

Respond with ONLY the intent phrase, nothing else.`,
        },
        {
          role: 'user',
          content: englishQuery,
        },
      ],
      temperature: 0.1,
      max_tokens: 20,
    });

    const intent = response.choices[0]?.message?.content?.trim() || '';
    // Clean up any punctuation or extra words
    return intent
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50); // Safety limit
  } catch (error) {
    console.error('Intent rewriting failed:', error);
    // Fallback: return normalized version of query
    return normalizeText(englishQuery)
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 6)
      .join(' ');
  }
}

/**
 * Semantic search: Returns top N FAQs based on embedding similarity.
 * No threshold filtering - returns top results regardless of score.
 * This ensures recall for edge cases.
 */
function getTopFAQs(intentEmbedding: number[], faqs: any[], topN: number = 5) {
  const ranked = faqs.map(faq => {
    let embedding: number[] = [];
    if (faq.embedding) {
      if (Array.isArray(faq.embedding)) {
        embedding = faq.embedding;
      } else if (typeof faq.embedding === 'string') {
        try {
          embedding = JSON.parse(faq.embedding);
        } catch {
          embedding = [];
        }
      }
    }

    // Use pure embedding similarity (no lexical matching)
    const similarity = embedding.length > 0 && embedding.length === intentEmbedding.length
      ? cosineSimilarity(intentEmbedding, embedding)
      : 0;

    return { faq, similarity };
  });

  ranked.sort((a, b) => b.similarity - a.similarity);
  return ranked.slice(0, topN);
}

/**
 * LLM selects the best FAQ from top candidates, or returns NONE.
 * This removes false positives from embedding search.
 */
async function selectBestFAQWithLLM(
  canonicalIntent: string,
  topFAQs: Array<{ faq: any; similarity: number }>,
  openai: OpenAI
): Promise<any | null> {
  if (topFAQs.length === 0) return null;

  try {
    // Build FAQ list for LLM
    const faqList = topFAQs
      .map((item, index) => {
        const faq = item.faq;
        // Intent is required - use it directly
        const displayText = faq.intent;
        return `${index + 1}. ${displayText}`;
      })
      .join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are selecting the best FAQ for a user's intent.

USER INTENT:
"${canonicalIntent}"

Your job is to match the FAQ that MOST DIRECTLY answers the intent.

STRICT MATCHING RULES:

1. MATCH SPECIFICITY (CRITICAL):
   - General intent (e.g., "pain", "discomfort") → MUST match a General FAQ.
   - Do NOT infer a specific cause (like "wire", "bracket") if the user did not say it.
   - Specific intent (e.g., "wire poking") → MUST match that specific cause.

2. Match INTENT FORM:
   - Question intent → explanatory FAQs
   - Problem intent → diagnostic/descriptive FAQs
   - Action intent → how-to/remedy FAQs

3. If multiple FAQs mention the same topic:
   → Choose the one whose intent FORM matches the user's intent FORM.

4. Higher similarity does NOT override intent mismatch.

If no FAQ clearly matches, respond "NONE".

Respond with ONLY the FAQ number or "NONE".`,
        },
        {
          role: 'user',
          content: `FAQ options:\n${faqList}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 10,
    });

    const result = response.choices[0]?.message?.content?.trim().toUpperCase();

    // Parse response
    if (result === 'NONE') {
      return null;
    }

    const match = result.match(/^(\d+)/);
    if (match) {
      const index = parseInt(match[1], 10) - 1;
      if (index >= 0 && index < topFAQs.length) {
        return topFAQs[index].faq;
      }
    }

    // If parsing fails, return null (safe fallback)
    return null;
  } catch (error) {
    console.error('LLM FAQ selection failed:', error);
    // Fallback: return top FAQ if similarity is reasonable
    if (topFAQs.length > 0 && topFAQs[0].similarity > 0.5) {
      return topFAQs[0].faq;
    }
    return null;
  }
}

const SAFE_FALLBACKS = {
  english: "I'm here to help with braces-related questions. Please try rephrasing your question or ask something specific about orthodontic care.",
  urdu: "میں بریسز سے متعلق سوالات میں مدد کے لیے یہاں موجود ہوں۔ براہ کرم اپنے سوال کو دوبارہ لکھیں۔",
  roman: "Main braces se mutaliq sawalat mein madad ke liye yahan mojood hoon. Barah-e-karam apne sawal ko dobara likhain.",
};

const EARLY_RESPONSES = {
  GREETING: {
    english: 'Hello! How can I help you with your dental care today?',
    urdu: 'سلام! میں آپ کی دانتوں کی دیکھ بھال میں کیسے مدد کر سکتا ہوں؟',
    roman: 'AOA! Main aap ki danton ki dekh bhaal mein kaise madad kar sakta hoon?',
  },
  META: {
    english: 'I am the DentalCare AI Assistant here to help with your orthodontic questions.',
    urdu: 'میں ڈینٹل کیئر اے آئی اسسٹنٹ ہوں جو آپ کے سوالات میں مدد کے لیے یہاں موجود ہوں۔',
    roman: 'Main DentalCare AI Assistant hoon jo aap ke sawalat mein madad ke liye yahan mojood hoon.',
  },
  IRRELEVANT: {
    english: 'I focus only on dental and orthodontic care. Please ask something related to teeth or braces.',
    urdu: 'میں صرف دانتوں اور آرتھوڈونٹکس سے متعلق سوالات کا جواب دے سکتا ہوں۔',
    roman: 'Main sirf danton aur braces se mutaliq sawalat ka jawab de sakta hoon.',
  },
};


type RouteCategory = 'GREETING' | 'META' | 'IRRELEVANT' | 'EDUCATION' | 'FAQ' | 'GENERAL';

async function strictRouter(canonicalIntent: string, userName: string, openai: OpenAI): Promise<RouteCategory> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  // Try OpenRouter first
  if (apiKey) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.VITE_APP_URL || 'http://localhost:3000',
        },
        body: JSON.stringify({
          model: 'google/gemma-3-27b-it:free', // User preferred model
          messages: [
            {
              role: 'system',
              content: `You are a STRICT request router.

You will be given a CANONICAL INTENT.
Your task is to decide what kind of response the system should produce.

You MUST output EXACTLY ONE of the following labels:
- GREETING
- META
- IRRELEVANT
- EDUCATION
- FAQ
- GENERAL

DO NOT output anything else.
DO NOT explain your decision.

━━━━━━━━━━━━━━━━━━
CORE RULE (MOST IMPORTANT):

If the intent is something a user would want to DO, FIX, USE, HANDLE, TREAT, CLEAN, or PERFORM,
it is FAQ — even if it looks like a topic.

Examples that MUST be FAQ:
- brushing braces properly
- using dental wax
- cleaning aligners
- wire poking cheek
- loose bracket
- pain from braces
- food stuck in braces
- tightening braces

━━━━━━━━━━━━━━━━━━
DEFINITIONS

GREETING
Short greetings only.
Examples: hi, hello, salam, hey

META
Questions about the assistant or the user.
Examples: who are you, what is my name

IRRELEVANT
Not about teeth, braces, or oral health.

EDUCATION
Only when the user wants to understand WHAT something is or WHY it exists.
These are knowledge-only topics with no action or problem implied.

Examples:
- what are braces
- what is an orthodontist
- why braces are used
- types of braces
- how braces work

FAQ
Any braces-related PROBLEM or ACTION.
If the user might expect instructions, steps, fixes, or help → FAQ.

Includes:
- cleaning
- brushing
- pain
- damage
- irritation
- broken parts
- how to use something
- how to fix something

GENERAL
Dental topics not related to orthodontics.
Examples: cavities, implants, veneers, toothache not from braces

━━━━━━━━━━━━━━━━━━
DECISION RULE

If the intent could be answered with steps, tips, or treatment → FAQ
If the intent could be answered with a definition or explanation → EDUCATION

When in doubt → FAQ

━━━━━━━━━━━━━━━━━━

Return ONLY ONE label.`
            },
            {
              role: 'user',
              content: `CANONICAL INTENT: "${canonicalIntent}"`
            }
          ],
          temperature: 0.1,
          max_tokens: 10,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const result = data.choices?.[0]?.message?.content?.trim().toUpperCase();
        if (['GREETING', 'META', 'IRRELEVANT', 'EDUCATION', 'FAQ', 'GENERAL'].includes(result)) {
          return result as RouteCategory;
        }
      } else {
        console.error('OpenRouter API error:', response.statusText);
      }
    } catch (error) {
      console.error('OpenRouter routing failed:', error);
    }
  }

  // Fallback to OpenAI
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a STRICT request router.

You will be given a CANONICAL INTENT.
Your task is to decide what kind of response the system should produce.

You MUST output EXACTLY ONE of the following labels:
- GREETING
- META
- IRRELEVANT
- EDUCATION
- FAQ
- GENERAL

DO NOT output anything else.
DO NOT explain your decision.

━━━━━━━━━━━━━━━━━━
CORE RULE (MOST IMPORTANT):

If the intent is something a user would want to DO, FIX, USE, HANDLE, TREAT, CLEAN, or PERFORM,
it is FAQ — even if it looks like a topic.

Examples that MUST be FAQ:
- brushing braces properly
- using dental wax
- cleaning aligners
- wire poking cheek
- loose bracket
- pain from braces
- food stuck in braces
- tightening braces

━━━━━━━━━━━━━━━━━━
DEFINITIONS

GREETING
Short greetings only.
Examples: hi, hello, salam, hey

META
Questions about the assistant or the user.
Examples: who are you, what is my name

IRRELEVANT
Not about teeth, braces, or oral health.

EDUCATION
Only when the user wants to understand WHAT something is or WHY it exists.
These are knowledge-only topics with no action or problem implied.

Examples:
- what are braces
- what is an orthodontist
- why braces are used
- types of braces
- how braces work

FAQ
Any braces-related PROBLEM or ACTION.
If the user might expect instructions, steps, fixes, or help → FAQ.

Includes:
- cleaning
- brushing
- pain
- damage
- irritation
- broken parts
- how to use something
- how to fix something

GENERAL
Dental topics not related to orthodontics.
Examples: cavities, implants, veneers, toothache not from braces

━━━━━━━━━━━━━━━━━━
DECISION RULE

If the intent could be answered with steps, tips, or treatment → FAQ
If the intent could be answered with a definition or explanation → EDUCATION

When in doubt → FAQ

━━━━━━━━━━━━━━━━━━

Return ONLY ONE label.`
        },
        { role: 'user', content: `Intent: "${canonicalIntent}"` }
      ],
      temperature: 0.1,
      max_tokens: 10,
    });

    const result = response.choices[0]?.message?.content?.trim().toUpperCase();
    if (['GREETING', 'META', 'IRRELEVANT', 'EDUCATION', 'FAQ', 'GENERAL'].includes(result)) {
      return result as RouteCategory;
    }
  } catch (error) {
    console.error('OpenAI routing failed:', error);
  }

  // Ultimate fallback
  return 'EDUCATION';
}

async function translateToEnglish(text: string, sourceLanguage: 'english' | 'urdu' | 'roman', openai: OpenAI): Promise<string> {
  if (sourceLanguage === 'english') return text;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Translate to English only.' },
        { role: 'user', content: text },
      ],
    });
    return response.choices[0]?.message?.content?.trim() || text;
  } catch {
    return text;
  }
}

async function translateFromEnglish(text: string, targetLanguage: 'english' | 'urdu' | 'roman', openai: OpenAI): Promise<string> {
  if (targetLanguage === 'english') return text;
  try {
    const systemPrompt = targetLanguage === 'urdu'
      ? 'Translate into Urdu script.'
      : 'Translate into Roman Urdu (English letters).';
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
    });
    return response.choices[0]?.message?.content?.trim() || text;
  } catch {
    return text;
  }
}

function selectMediaFromLinkedIds(faqMediaIds: number[] | undefined, media: any[]): string[] {
  if (!faqMediaIds || faqMediaIds.length === 0 || media.length === 0) return [];
  return media
    .filter(m => faqMediaIds.includes(m.id))
    .map(m => m.url)
    .filter(url => url && typeof url === 'string');
}

function selectMediaByKeywords(englishQuery: string, media: any[]): string[] {
  if (media.length === 0) return [];
  const normalized = englishQuery.toLowerCase();

  if (normalized.includes('functions') || normalized.includes('uses') ||
    (normalized.includes('parts') && (normalized.includes('function') || normalized.includes('use')))) {
    const partsMedia = media.filter(m => m.id === 5 || m.id === 6);
    return partsMedia.map(m => m.url).filter(url => url && typeof url === 'string');
  }

  if (normalized.includes('brush') || normalized.includes('cleaning')) {
    const brushMedia = media.filter(m => m.id === 1 || m.id === 3);
    return brushMedia.map(m => m.url).filter(url => url && typeof url === 'string');
  }

  if (normalized.includes('wire') && (normalized.includes('poke') || normalized.includes('sharp'))) {
    const wireMedia = media.filter(m => m.id === 2 || m.id === 4);
    return wireMedia.map(m => m.url).filter(url => url && typeof url === 'string');
  }

  if (normalized.includes('parts') || normalized.includes('component')) {
    const partsMedia = media.filter(m => m.id === 5 || m.id === 6);
    return partsMedia.map(m => m.url).filter(url => url && typeof url === 'string');
  }

  return [];
}

export default async function handler(req: Request) {
  const PIPELINE_VERSION = 1;
  const pipelineLogs: string[] = [];
  const log = (msg: string, ...args: any[]) => {
    const formatted = args.length > 0 ? `${msg} ${JSON.stringify(args)}` : msg;
    pipelineLogs.push(formatted);
    console.log(formatted);
  };

  log(`[CHAT_REQUEST] ${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const tursoUrl = process.env.TURSO_DATABASE_URL || 'libsql://dentalcare-ai-zunxo7.aws-ap-south-1.turso.io';
    const tursoAuthToken = process.env.TURSO_AUTH_TOKEN || '';
    const db = createClient({
      url: tursoUrl,
      authToken: tursoAuthToken || undefined,
    });

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not set');
    }
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const { message, userName, userId, suggestionFaqId }: BotRequest = await req.json();

    if (!message || !userName) {
      return new Response(
        JSON.stringify({ error: 'message and userName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const queryId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Input Validation
    const MAX_INPUT_LENGTH = 1000;
    const trimmed = message.trim();
    if (!trimmed) {
      return new Response(
        JSON.stringify({ text: SAFE_FALLBACKS.english, mediaUrls: [], faqId: null, queryId, pipelineLogs } as BotResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalized = isValidInput(trimmed, MAX_INPUT_LENGTH) ? trimmed : truncateText(trimmed, MAX_INPUT_LENGTH);

    // Identify suggestion candidates (3 words or less)
    const queryWordCount = normalized.split(/\s+/).filter(w => w.length > 0).length;
    const isSuggestionCandidate = queryWordCount <= 3;


    // --- 0. SUGGESTION CLICK HANDLING (Direct Resolution) ---
    if (suggestionFaqId) {
      log(`[PIPELINE] Suggestion Click Detected: FAQ ID ${suggestionFaqId}`);

      // Detect language of the *message* (the chip text) to reply in correct language
      const detectedLang = detectLanguage(normalized);

      const faq = await dbHelpers.selectOne(db, 'faqs', { column: 'id', value: suggestionFaqId });

      if (faq) {
        // Fetch media
        const media = await dbHelpers.selectAll(db, 'media', 'id, title, url, type');

        let finalAnswer = faq.answer;
        // Translate answer if needed
        if (detectedLang !== 'english') {
          finalAnswer = await translateFromEnglish(finalAnswer, detectedLang, openai);
        }

        const selectedMedia = selectMediaFromLinkedIds(faq.media_ids ? JSON.parse(faq.media_ids) : [], media);

        // Log conversation - wrapped in try-catch to not block response
        try {
          await dbHelpers.insert(db, 'chat_messages', {
            query_id: queryId,
            sender: 'user',
            text: normalized,
            canonical_intent: `SUGGESTION_CLICK:${suggestionFaqId}`,
            route: 'FAQ',
            resolved_faq_id: suggestionFaqId,
            pipeline_version: PIPELINE_VERSION,
            created_at: new Date().toISOString()
          });

          await dbHelpers.insert(db, 'chat_messages', {
            query_id: queryId,
            sender: 'bot',
            text: finalAnswer,
            media_urls: JSON.stringify(selectedMedia),
            resolved_faq_id: suggestionFaqId,
            pipeline_version: PIPELINE_VERSION,
            created_at: new Date().toISOString()
          });
        } catch (logErr) {
          console.error('[SUGGESTION_CLICK] Failed to log messages:', logErr);
          // Continue anyway
        }

        return new Response(
          JSON.stringify({
            text: finalAnswer,
            mediaUrls: selectedMedia,
            faqId: suggestionFaqId,
            queryId,
            pipelineLogs
          } as BotResponse),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }


    // If not, we continue to the main pipeline.

    // --- CACHE LOGIC START ---
    let cacheEnabled = true;
    try {
      const setting = await dbHelpers.selectOne(db, 'app_settings', { column: 'key', value: 'cache_enabled' });

      if (setting && setting.value === 'false') {
        cacheEnabled = false;
      }
    } catch (e) {
      log('[CACHE] Error reading settings, defaulting to ENABLED', e);
    }

    log(`[CACHE] Status: ${cacheEnabled ? 'ENABLED' : 'DISABLED'}`);

    let usingCached = false;
    let cachedIntent: string | null = null;
    let cachedRoute: RouteCategory | null = null;
    let cachedFaqId: number | null = null;

    // Attempt to read from cache ONLY if enabled and NOT a suggestion candidate
    if (cacheEnabled && !isSuggestionCandidate) {
      try {
        log(`[CACHE] Checking cache for query: "${normalized}"`);

        // Find RECENT message with SAME text and SAME version
        const result = await db.execute({
          sql: `SELECT canonical_intent, route, resolved_faq_id, query_id
                 FROM chat_messages 
                 WHERE sender = 'user' 
                   AND lower(text) = lower(?) 
                   AND pipeline_version = ?
                   AND route IS NOT NULL
                 ORDER BY created_at DESC 
                 LIMIT 1`,
          args: [normalized, PIPELINE_VERSION]
        });

        if (result.rows.length > 0) {
          const row = result.rows[0];

          // 1. Try to fetch FULL bot response (Text + Media + Suggestions)
          if (row.query_id) {
            try {
              const botRes = await db.execute({
                sql: `SELECT text, media_urls, resolved_faq_id, suggestions_json 
                      FROM chat_messages 
                      WHERE query_id = ? AND sender = 'bot' 
                      LIMIT 1`,
                args: [row.query_id]
              });

              if (botRes.rows.length > 0) {
                const botRow = botRes.rows[0];
                log('[CACHE] FULL HIT - Returning fully cached response');

                let mediaUrls: string[] = [];
                try {
                  mediaUrls = JSON.parse(botRow.media_urls as string || '[]');
                } catch { }

                let suggestions: any[] = [];
                try {
                  suggestions = JSON.parse(botRow.suggestions_json as string || '[]');
                } catch { }

                return new Response(
                  JSON.stringify({
                    text: botRow.text,
                    mediaUrls: mediaUrls,
                    faqId: botRow.resolved_faq_id,
                    queryId, // Return NEW queryId for frontend tracking
                    suggestions: suggestions.length > 0 ? suggestions : undefined,
                    pipelineLogs: [...pipelineLogs, '[CACHE] FULL HIT - Response reused']
                  } as BotResponse),
                  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
              }
            } catch (e) {
              log('[CACHE] Full response lookup failed, falling back to partial', e);
            }
          }

          // 2. Fallback to Partial Cache (reuse decisions but regenerate text)
          if (row.canonical_intent && row.route) {
            cachedIntent = row.canonical_intent as string;
            cachedRoute = row.route as RouteCategory;
            // resolved_faq_id can be null, so check if column exists/was fetched
            cachedFaqId = row.resolved_faq_id as number | null;
            usingCached = true;
            log('[CACHE] PARTIAL HIT - Reusing intent/route, will regenerate text');
          }
        }
      } catch (e) {
        log('[CACHE] Read failed', e);
      }
    }

    if (!usingCached && cacheEnabled) {
      if (isSuggestionCandidate) {
        log('[CACHE] BYPASS - Suggestion candidate (short query) always fetches fresh data');
      } else {
        log('[CACHE] MISS - Computing fresh values');
      }
    }

    // --- CACHE LOGIC END ---

    // 1. Language Detection (Always run, fast and needed for response)
    const language = detectLanguage(normalized);
    log('[PIPELINE] Language detected:', language);
    log('[PIPELINE] Original query:', normalized);

    // 2. Translation (Always run if needed)
    let englishQuery = normalized;
    if (language !== 'english') {
      englishQuery = await translateToEnglish(normalized, language, openai);
      log('[PIPELINE] Translated to English:', englishQuery);
    }

    // 3. Canonical Intent
    // Reuse cached if available, otherwise compute
    let canonicalIntent = '';
    if (usingCached && cachedIntent) {
      canonicalIntent = cachedIntent;
      log('[PIPELINE] Using CACHED Intent:', canonicalIntent);
    } else {
      canonicalIntent = await rewriteToCanonicalIntent(englishQuery, openai);
      log('[PIPELINE] Computed intent:', canonicalIntent);
    }

    // --- SUGGESTION CHIPS CHECK (using canonical intent) ---
    // Only check if original query is short (3 words or less)
    if (isSuggestionCandidate) {
      try {
        const matchGroups = await dbHelpers.selectAll(db, 'suggestions');
        const intentWords = canonicalIntent.toLowerCase().split(/\s+/);

        let collectedChips: any[] = [];

        for (const group of matchGroups) {
          const kws = (group.keywords || '').toLowerCase().split(/\s+/).map((k: string) => k.trim()).filter((k: string) => k);

          // Check if any keyword matches any intent word OR is contained in the canonical intent
          const isMatch = kws.some((k: string) => k && (intentWords.includes(k) || canonicalIntent.toLowerCase().includes(k)));

          if (isMatch) {
            try {
              const chips = JSON.parse(group.chips_json || '[]');
              collectedChips = [...collectedChips, ...chips];
              log(`[SUGGESTIONS] Matched group ${group.id} with ${chips.length} chips`);
            } catch (e) {
              log(`[SUGGESTIONS] Failed to parse chips for group ${group.id}`);
            }
          }
        }

        if (collectedChips.length > 0) {
          log(`[SUGGESTIONS] Returning ${collectedChips.length} suggestions for query: "${normalized}"`);
          let suggestReply = "Here are some suggestions:";
          // Simple heuristic for Urdu/Roman
          if (/[^\u0000-\u007F]/.test(normalized)) {
            suggestReply = "یہاں کچھ تجاویز ہیں:";
          }

          // --- PERSIST TO CACHE BEFORE EARLY RETURN ---
          try {
            await db.execute({
              sql: `UPDATE chat_messages 
                        SET canonical_intent = ?, 
                            route = ?, 
                            pipeline_version = ?,
                            query_id = ?
                        WHERE id = (
                          SELECT id FROM chat_messages 
                          WHERE sender = 'user' 
                          ORDER BY created_at DESC 
                          LIMIT 1
                        ) AND sender = 'user'`,
              args: [
                canonicalIntent,
                'GENERAL', // Use GENERAL as fallback route
                PIPELINE_VERSION,
                queryId
              ]
            });
            log('[CACHE] Updated latest message row (Suggestion Path)');
          } catch (e) {
            log('[CACHE] Failed to update message row (Suggestion Path)', e);
          }

          // Return suggestions early
          return new Response(
            JSON.stringify({
              text: suggestReply,
              mediaUrls: [],
              faqId: null,
              queryId,
              suggestions: collectedChips,
              pipelineLogs
            } as BotResponse),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (err) {
        log('[SUGGESTIONS] Error in suggestion logic:', err);
        // Fall through to main pipeline if error
      }
    }
    // --- END SUGGESTION CHIPS CHECK ---


    // Load DB Resources
    const [faqs, media] = await Promise.all([
      dbHelpers.selectAll(db, 'faqs', 'id, question, answer, embedding, media_ids, intent'),
      dbHelpers.selectAll(db, 'media', 'id, title, url, type'),
    ]);

    // 4. Strict Routing
    let route: RouteCategory;
    if (usingCached && cachedRoute) {
      route = cachedRoute;
      log('[PIPELINE] Using CACHED Route:', route);
    } else {
      route = await strictRouter(canonicalIntent, userName, openai);
      log('[PIPELINE] Computed Route:', route);
    }

    let finalAnswer = '';
    let selectedMedia: string[] = [];
    let selectedFAQ: any = null;
    let resolvedFaqIdForCache: number | null = null; // Store for writing to DB

    // 5. Branching Logic
    switch (route) {
      case 'GREETING':
      case 'META':
      case 'IRRELEVANT': {
        finalAnswer = EARLY_RESPONSES[route][language] || EARLY_RESPONSES[route].english;
        // No FAQ for these
        resolvedFaqIdForCache = null;
        break;
      }

      case 'EDUCATION': {
        // Generate educational explanation
        resolvedFaqIdForCache = null; // Education never links to FAQ
        try {
          const llmResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            max_tokens: 250,
            messages: [
              {
                role: 'system',
                content: 'You are an expert orthodontic educator. Explain the concept clearly and concisely. Focus on WHAT it is and WHY it is used. Do not give medical advice.'
              },
              { role: 'user', content: `Explain this concept: "${canonicalIntent}"` }
            ],
          });
          finalAnswer = llmResponse.choices[0]?.message?.content?.trim() || SAFE_FALLBACKS.english;

          // Attach Braces Diagram (IDs 5 and 6)
          const partsMedia = media.filter((m: any) => m.id === 5 || m.id === 6);
          selectedMedia = partsMedia.map((m: any) => m.url).filter((url: any) => typeof url === 'string');
          log('[PIPELINE] Attached educational media (parts/diagrams)');
        } catch (e) {
          log('[PIPELINE] Education generation failed', e);
          finalAnswer = SAFE_FALLBACKS.english;
        }
        break;
      }

      case 'GENERAL': {
        // Generate general dental response
        resolvedFaqIdForCache = null;
        try {
          const llmResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            max_tokens: 250,
            messages: [
              {
                role: 'system',
                content: 'You are a helpful dental assistant. Answer the general dental question politely. Mention that you specialize in orthodontics (braces) specifically. Do not give medical diagnosis.'
              },
              { role: 'user', content: englishQuery }
            ],
          });
          finalAnswer = llmResponse.choices[0]?.message?.content?.trim() || SAFE_FALLBACKS.english;
        } catch (e) {
          finalAnswer = SAFE_FALLBACKS.english;
        }
        break;
      }

      case 'FAQ': {
        // Logic: 
        // If cached and we have a resolved ID (or explicit NULL meaning "attempted but no match"), use it.
        // Wait, cachedFaqId could be NULL. Does NULL mean "No FAQ" or "Not cached"?
        // In our cache logic, we only set `usingCached=true` if we found a row. 
        // If `usingCached` is true:
        //    if cachedFaqId is NOT NULL -> Use that FAQ.
        //    if cachedFaqId IS NULL -> It means previous run found NO FAQ. Skip search.

        let shouldRunFaqSearch = true;

        if (usingCached) {
          if (cachedFaqId !== null) {
            // We have a specific FAQ ID cached
            const cachedFaq = faqs.find((f: any) => f.id === cachedFaqId);
            if (cachedFaq) {
              selectedFAQ = cachedFaq;
              log('[PIPELINE] Using CACHED FAQ ID:', cachedFaqId);
              shouldRunFaqSearch = false;
            } else {
              // ID in cache but not in DB? Weird. Fallback to search.
              log('[PIPELINE] Cached FAQ ID not found in current DB, re-running search');
            }
          } else {
            // Cached ID is NULL. This means "Last time we checked, there was no matching FAQ".
            // So we TRUST that decision and skip search.
            log('[PIPELINE] Using CACHED result: NO FAQ matched previously.');
            shouldRunFaqSearch = false;
          }
        }

        if (shouldRunFaqSearch) {
          try {
            const intentEmbeddingResponse = await openai.embeddings.create({
              model: 'text-embedding-3-small',
              input: canonicalIntent,
            });
            const intentEmbedding = intentEmbeddingResponse.data[0]?.embedding || [];

            if (intentEmbedding.length > 0) {
              const topFAQs = getTopFAQs(intentEmbedding, faqs, 5);
              log('[PIPELINE] Top 5 FAQs found (Running selection)');
              topFAQs.forEach((f, i) => log(`[PIPELINE] Candidate #${i + 1}: ID=${f.faq.id} Score=${f.similarity.toFixed(4)} Intent="${f.faq.intent}"`));

              selectedFAQ = await selectBestFAQWithLLM(canonicalIntent, topFAQs, openai);

              if (selectedFAQ) {
                resolvedFaqIdForCache = selectedFAQ.id;
                log('[PIPELINE] ✅ FAQ matched:', selectedFAQ.id);
              } else {
                resolvedFaqIdForCache = null; // Explicitly no match
                log('[PIPELINE] ❌ No FAQ match - generating answer with LLM');
              }
            }
          } catch (e) {
            log('[PIPELINE] FAQ logic failed', e);
            resolvedFaqIdForCache = null;
            finalAnswer = SAFE_FALLBACKS.english;
          }
        } else {
          // If we skipped search
          if (selectedFAQ) {
            resolvedFaqIdForCache = selectedFAQ.id;
          } else {
            resolvedFaqIdForCache = null;
          }
        }

        // Generate Answer based on selection
        if (selectedFAQ) {
          finalAnswer = selectedFAQ.answer;
          selectedMedia = selectMediaFromLinkedIds(selectedFAQ.media_ids, media);
        } else {
          // Fallback generation
          try {
            const llmResponse = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              max_tokens: 250,
              messages: [
                { role: 'system', content: 'You are an orthodontic assistant. The user has a braces problem. Provide a helpful, safe response. Recommend seeing an orthodontist.' },
                { role: 'user', content: englishQuery }
              ]
            });
            finalAnswer = llmResponse.choices[0]?.message?.content?.trim() || SAFE_FALLBACKS.english;
          } catch {
            finalAnswer = SAFE_FALLBACKS.english;
          }
        }
        break;
      }

      default: {
        finalAnswer = SAFE_FALLBACKS.english;
      }
    }

    // 6. Translate Answer Back
    if (language !== 'english' && !['GREETING', 'META', 'IRRELEVANT'].includes(route)) {
      log('[PIPELINE] Translating answer back to', language);
      finalAnswer = await translateFromEnglish(finalAnswer, language, openai);
    }

    log(`[PIPELINE_DONE] QueryId: ${queryId} | Route: ${route} | Media: ${selectedMedia.length}`);

    // --- WRITE CACHE TO DB ---
    // Update the LATEST message from this user to include the computed fields.
    // We assume the frontend just inserted the message, so it's the most recent one.
    try {
      const updateResult = await db.execute({
        sql: `UPDATE chat_messages 
                  SET canonical_intent = ?, 
                      route = ?, 
                      resolved_faq_id = ?, 
                      pipeline_version = ?,
                      query_id = ?
                  WHERE id = (
                    SELECT id FROM chat_messages 
                    WHERE sender = 'user' 
                    ORDER BY created_at DESC 
                    LIMIT 1
                  ) AND sender = 'user'`, // Checking sender again for safety
        args: [
          canonicalIntent,
          route,
          resolvedFaqIdForCache, // Can be null
          PIPELINE_VERSION,
          queryId
        ]
      });
      log('[CACHE] Updated latest message row with pipeline decisions.');
    } catch (e) {
      log('[CACHE] Failed to update message row', e);
    }

    return new Response(
      JSON.stringify({
        text: finalAnswer,
        mediaUrls: selectedMedia,
        faqId: selectedFAQ?.id || null,
        queryId,
        pipelineLogs,
      } as BotResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Chat function error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        text: SAFE_FALLBACKS.english,
        mediaUrls: [],
        faqId: null,
        queryId: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
        pipelineLogs: [],
      } as BotResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

