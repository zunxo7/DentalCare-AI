// Vercel Edge Function: Chat/Bot endpoint
// Keeps OpenAI API key server-side

import { createClient } from '@libsql/client';
import OpenAI from 'openai';
import * as dbHelpers from '../lib/dbHelpers.js';

export const config = { runtime: 'edge' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BotRequest {
  message: string;
  userName: string;
  userId?: string | null;
}

interface BotResponse {
  text: string;
  mediaUrls: string[];
  faqId: number | null;
  queryId: string | null;
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

function getTopFAQs(query: string, queryEmbedding: number[], faqs: any[], topN: number = 3) {
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
    
    const embeddingScore = embedding.length > 0 && embedding.length === queryEmbedding.length
      ? cosineSimilarity(queryEmbedding, embedding)
      : 0;
    
    const normalizedQuery = normalizeText(query);
    const normalizedFaq = normalizeText(faq.question);
    let lexicalScore = 0;
    if (normalizedQuery === normalizedFaq) {
      lexicalScore = 1.0;
    } else if (normalizedFaq.includes(normalizedQuery) || normalizedQuery.includes(normalizedFaq)) {
      lexicalScore = 0.8;
    } else {
      const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2);
      const faqWords = normalizedFaq.split(/\s+/).filter(w => w.length > 2);
      if (queryWords.length > 0 && faqWords.length > 0) {
        const commonWords = queryWords.filter(w => faqWords.includes(w));
        lexicalScore = (commonWords.length / Math.max(queryWords.length, faqWords.length)) * 0.6;
      }
    }
    
    const combinedScore = 0.7 * embeddingScore + 0.3 * lexicalScore;
    return { faq, combinedScore };
  });
  
  ranked.sort((a, b) => b.combinedScore - a.combinedScore);
  return ranked.slice(0, topN);
}

function selectBestFAQ(ranked: any[], threshold: number = 0.6) {
  if (ranked.length === 0) return null;
  const top = ranked[0];
  return top.combinedScore >= threshold ? top.faq : null;
}

const SAFE_FALLBACKS = {
  english: "I'm here to help with braces-related questions. Please try rephrasing your question or ask something specific about orthodontic care.",
  urdu: "میں بریسز سے متعلق سوالات میں مدد کے لیے یہاں موجود ہوں۔ براہ کرم اپنے سوال کو دوبارہ لکھیں۔",
  roman: "Main braces se mutaliq sawalat mein madad ke liye yahan mojood hoon. Barah-e-karam apne sawal ko dobara likhain.",
};

const EARLY_RESPONSES = {
  greeting: {
    english: 'Hello! How can I help you with dental care today?',
    urdu: 'سلام! میں آپ کی دانتوں کی دیکھ بھال میں کیسے مدد کر سکتا ہوں؟',
    roman: 'AOA! Main aap ki danton ki dekh bhaal mein kaise madad kar sakta hoon?',
  },
  bot_name: {
    english: 'My name is DentalClinic AI.',
    urdu: 'میرا نام DentalClinic AI ہے۔',
    roman: 'Mera naam DentalClinic AI hai.',
  },
  irrelevant: {
    english: 'I can only answer orthodontic questions. Please ask something related to orthodontics.',
    urdu: 'میں صرف آرتھوڈونٹکس سے متعلق سوالات کا جواب دے سکتا ہوں۔',
    roman: 'Main sirf orthodontic sawalat ka jawab de sakta hoon.',
  },
};

async function classifyQueryType(text: string, userName: string): Promise<'greeting' | 'bot_name' | 'user_name' | 'irrelevant' | 'none'> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn('OpenRouter API key not found, skipping classification');
    return 'none';
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.VITE_APP_URL || 'http://localhost:3000',
      },
      body: JSON.stringify({
        model: 'google/gemma-3-27b-it:free',
        messages: [
          {
            role: 'system',
            content: `Classify the user query into ONE of these categories:
- "greeting" if it's a greeting (hello, hi, salam, etc.)
- "bot_name" if asking for your name or who you are
- "user_name" if asking for their own name (the user's name is: ${userName})
- "irrelevant" if it's irrelevant to orthodontics, inappropriate, offensive, or spam
- "none" if it's a legitimate orthodontic/dental question

Respond with ONLY the category name, nothing else.`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0.1,
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('OpenRouter API error details:', errorData);
      throw new Error(`OpenRouter API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim().toLowerCase();
    
    if (result === 'greeting' || result === 'bot_name' || result === 'user_name' || result === 'irrelevant') {
      return result as 'greeting' | 'bot_name' | 'user_name' | 'irrelevant';
    }
    
    return 'none';
  } catch (error) {
    console.error('OpenRouter classification failed:', error);
    return 'none';
  }
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Turso client
    const tursoUrl = process.env.TURSO_DATABASE_URL || 'libsql://dentalcare-ai-zunxo7.aws-ap-south-1.turso.io';
    const tursoAuthToken = process.env.TURSO_AUTH_TOKEN || '';
    const db = createClient({
      url: tursoUrl,
      authToken: tursoAuthToken || undefined,
    });

    // Get OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not set');
    }
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Parse request
    const { message, userName, userId }: BotRequest = await req.json();
    
    if (!message || !userName) {
      return new Response(
        JSON.stringify({ error: 'message and userName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate query ID
    const queryId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Normalize input
    const MAX_INPUT_LENGTH = 1000;
    const trimmed = message.trim();
    if (!trimmed) {
      const fallback = SAFE_FALLBACKS.english;
      return new Response(
        JSON.stringify({
          text: fallback,
          mediaUrls: [],
          faqId: null,
          queryId,
        } as BotResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const normalized = isValidInput(trimmed, MAX_INPUT_LENGTH)
      ? trimmed
      : truncateText(trimmed, MAX_INPUT_LENGTH);

    // Detect language
    const language = detectLanguage(normalized);

    // Fetch FAQs and media from database
    const [faqs, media] = await Promise.all([
      dbHelpers.selectAll(db, 'faqs', 'id, question, answer, embedding, media_ids'),
      dbHelpers.selectAll(db, 'media', 'id, title, url, type'),
    ]);

    // Classify query type
    const queryType = await classifyQueryType(normalized, userName);
    
    if (queryType === 'greeting') {
      const response = EARLY_RESPONSES.greeting[language] || EARLY_RESPONSES.greeting.english;
      return new Response(
        JSON.stringify({
          text: response,
          mediaUrls: [],
          faqId: null,
          queryId,
        } as BotResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (queryType === 'bot_name') {
      const response = EARLY_RESPONSES.bot_name[language] || EARLY_RESPONSES.bot_name.english;
      return new Response(
        JSON.stringify({
          text: response,
          mediaUrls: [],
          faqId: null,
          queryId,
        } as BotResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (queryType === 'user_name') {
      const response = `Your name is ${userName}.`;
      return new Response(
        JSON.stringify({
          text: response,
          mediaUrls: [],
          faqId: null,
          queryId,
        } as BotResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (queryType === 'irrelevant') {
      const response = EARLY_RESPONSES.irrelevant[language] || EARLY_RESPONSES.irrelevant.english;
      return new Response(
        JSON.stringify({
          text: response,
          mediaUrls: [],
          faqId: null,
          queryId,
        } as BotResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Translate to English if needed
    let englishQuery = normalized;
    if (language !== 'english') {
      englishQuery = await translateToEnglish(normalized, language, openai);
    }

    // FAQ matching
    let selectedFAQ: any = null;
    let faqAnswer: string | null = null;
    
    try {
      const queryEmbeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: englishQuery,
      });
      const queryEmbedding = queryEmbeddingResponse.data[0]?.embedding || [];
      
      if (queryEmbedding.length > 0) {
        const rankedFAQs = getTopFAQs(englishQuery, queryEmbedding, faqs, 3);
        selectedFAQ = selectBestFAQ(rankedFAQs, 0.6);
        
        if (selectedFAQ) {
          faqAnswer = selectedFAQ.answer;
        }
      }
    } catch (error) {
      console.error('FAQ matching error:', error);
    }

    // Generate answer
    let finalAnswer: string;
    if (faqAnswer) {
      finalAnswer = faqAnswer;
    } else {
      try {
        const llmResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an orthodontic assistant. Provide clear, helpful answers about braces care. Never provide medical diagnosis or prescriptions. Always recommend consulting an orthodontist for specific concerns.',
            },
            { role: 'user', content: englishQuery },
          ],
        });
        finalAnswer = llmResponse.choices[0]?.message?.content?.trim() || SAFE_FALLBACKS.english;
      } catch {
        finalAnswer = SAFE_FALLBACKS.english;
      }
    }

    // Select media
    let selectedMedia: string[] = [];
    if (selectedFAQ) {
      selectedMedia = selectMediaFromLinkedIds(selectedFAQ.media_ids, media);
    } else {
      selectedMedia = selectMediaByKeywords(englishQuery, media);
    }

    // Translate back if needed
    if (language !== 'english') {
      finalAnswer = await translateFromEnglish(finalAnswer, language, openai);
    }

    // Return response
    const response: BotResponse = {
      text: finalAnswer,
      mediaUrls: selectedMedia,
      faqId: selectedFAQ?.id || null,
      queryId,
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Chat function error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        text: SAFE_FALLBACKS.english,
        mediaUrls: [],
        faqId: null,
        queryId: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

