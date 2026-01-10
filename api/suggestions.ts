
import { createClient } from '@libsql/client';
import OpenAI from 'openai';
import * as dbHelpers from '../lib/dbHelpers.js';

export const config = { runtime: 'edge' };

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

export default async function handler(req: Request) {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    try {
        const url = new URL(req.url);

        if (req.method === 'GET') {
            const suggestions = await dbHelpers.selectAll(db, 'suggestions', '*', { column: 'created_at', ascending: false });
            return new Response(JSON.stringify(suggestions), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (req.method === 'POST') {
            const { english_text, linked_faq_id } = await req.json();

            if (!english_text || !linked_faq_id) {
                return new Response('Missing required fields', { status: 400, headers: corsHeaders });
            }

            // 1. Auto-translate using LLM
            const translationPrompt = `
      You are a professional translator for a dental chatbot.
      Translate the following English phrase into:
      1. Urdu (proper script)
      2. Roman Urdu (phonetic alphabet)

      Phrase: "${english_text}"

      Respond strictly in JSON format:
      {
        "urdu": "...",
        "roman": "..."
      }
      `;

            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'system', content: 'You are a translator.' }, { role: 'user', content: translationPrompt }],
                response_format: { type: 'json_object' },
            });

            const translations = JSON.parse(completion.choices[0].message.content || '{}');

            // 2. Insert into DB
            const newSuggestion = await dbHelpers.insert(db, 'suggestions', {
                english_text,
                urdu_text: translations.urdu || english_text, // Fallback
                roman_text: translations.roman || english_text, // Fallback
                linked_faq_id,
            });

            return new Response(JSON.stringify(newSuggestion), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (req.method === 'DELETE') {
            const id = url.searchParams.get('id');
            if (!id) return new Response('Missing ID', { status: 400, headers: corsHeaders });

            await dbHelpers.deleteWhere(db, 'suggestions', { column: 'id', value: Number(id) });
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        return new Response('Method not allowed', { status: 405, headers: corsHeaders });

    } catch (error: any) {
        console.error('API Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
}
