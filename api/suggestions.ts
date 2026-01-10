
import { createClient } from '@libsql/client';
import OpenAI from 'openai';
import * as dbHelpers from '../lib/dbHelpers';

export const config = { runtime: 'edge' };

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

// ... (imports remain)

export default async function handler(req: Request) {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL || 'libsql://dentalcare-ai-zunxo7.aws-ap-south-1.turso.io',
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    try {
        const url = new URL(req.url);

        if (req.method === 'GET') {
            const rawGroups = await dbHelpers.selectAll(db, 'suggestions', '*', { column: 'created_at', ascending: false });
            // Parse chips_json for frontend
            const groups = rawGroups.map((g: any) => ({
                ...g,
                chips: JSON.parse(g.chips_json || '[]'),
            }));
            return new Response(JSON.stringify(groups), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (req.method === 'POST') {
            // body: { keywords: string, chips: { text_en: string, linked_faq_id: number }[] }
            const { keywords, chips } = await req.json();

            if (!keywords || !chips || !Array.isArray(chips) || chips.length === 0) {
                return new Response('Missing keywords or chips', { status: 400, headers: corsHeaders });
            }

            // 1. Process all chips: Translate in parallel
            const processedChips = await Promise.all(chips.map(async (chip: any) => {
                const translationPrompt = `
                You are a professional translator for a dental chatbot.
                Translate the following English phrase into:
                1. Urdu (proper script)
                2. Roman Urdu (phonetic alphabet)
          
                Phrase: "${chip.text_en}"
          
                Respond strictly in JSON format:
                {
                  "urdu": "...",
                  "roman": "..."
                }
                `;

                try {
                    const completion = await openai.chat.completions.create({
                        model: 'gpt-4o-mini',
                        messages: [{ role: 'system', content: 'You are a translator.' }, { role: 'user', content: translationPrompt }],
                        response_format: { type: 'json_object' },
                    });

                    const translations = JSON.parse(completion.choices[0].message.content || '{}');
                    return {
                        text_en: chip.text_en,
                        text_ur: translations.urdu || chip.text_en,
                        text_roman: translations.roman || chip.text_en,
                        linked_faq_id: chip.linked_faq_id
                    };
                } catch (e) {
                    console.error('Translation failed for chip:', chip.text_en, e);
                    // Fallback to English if translation fails
                    return {
                        text_en: chip.text_en,
                        text_ur: chip.text_en,
                        text_roman: chip.text_en,
                        linked_faq_id: chip.linked_faq_id
                    };
                }
            }));

            // 2. Insert Group into DB
            const newGroup = await dbHelpers.insert(db, 'suggestions', {
                keywords,
                chips_json: JSON.stringify(processedChips),
            });

            return new Response(JSON.stringify(newGroup), {
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

        if (req.method === 'PUT') {
            const { id, keywords, chips } = await req.json();

            if (!id || !keywords || !chips || !Array.isArray(chips) || chips.length === 0) {
                return new Response('Missing id, keywords or chips', { status: 400, headers: corsHeaders });
            }

            // Process all chips: Translate in parallel
            const processedChips = await Promise.all(chips.map(async (chip: any) => {
                const translationPrompt = `
                You are a professional translator for a dental chatbot.
                Translate the following English phrase into:
                1. Urdu (proper script)
                2. Roman Urdu (phonetic alphabet)
          
                Phrase: "${chip.text_en}"
          
                Respond strictly in JSON format:
                {
                  "urdu": "...",
                  "roman": "..."
                }
                `;

                try {
                    const completion = await openai.chat.completions.create({
                        model: 'gpt-4o-mini',
                        messages: [{ role: 'system', content: 'You are a translator.' }, { role: 'user', content: translationPrompt }],
                        response_format: { type: 'json_object' },
                    });

                    const translations = JSON.parse(completion.choices[0].message.content || '{}');
                    return {
                        text_en: chip.text_en,
                        text_ur: translations.urdu || chip.text_en,
                        text_roman: translations.roman || chip.text_en,
                        linked_faq_id: chip.linked_faq_id
                    };
                } catch (e) {
                    console.error('Translation failed for chip:', chip.text_en, e);
                    return {
                        text_en: chip.text_en,
                        text_ur: chip.text_en,
                        text_roman: chip.text_en,
                        linked_faq_id: chip.linked_faq_id
                    };
                }
            }));

            // Update in DB
            await dbHelpers.update(db, 'suggestions', {
                keywords,
                chips_json: JSON.stringify(processedChips),
            }, { column: 'id', value: Number(id) });

            return new Response(JSON.stringify({ success: true, id }), {
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
