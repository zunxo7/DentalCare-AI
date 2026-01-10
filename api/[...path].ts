// Vercel Edge Function: Main API endpoint (catch-all route)
// Handles all /api/* routes

import { createClient } from '@libsql/client';
import OpenAI from 'openai';
import * as dbHelpers from '../lib/dbHelpers';

export const config = { runtime: 'edge' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-password',
};

// Helper: Get admin password from env or header
function getAdminPassword(req: Request): string | null {
  const headerPassword = req.headers.get('x-admin-password');
  if (headerPassword) return headerPassword;
  return process.env.ADMIN_PASSWORD || null;
}

// Helper: Check if request requires admin
function requireAdmin(req: Request): { authorized: boolean; error?: string } {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return { authorized: false, error: 'Server configuration error: Admin password not set' };
  }

  const providedPassword = getAdminPassword(req);
  if (!providedPassword || providedPassword !== adminPassword) {
    return { authorized: false, error: 'Access denied. Admin privileges required.' };
  }

  return { authorized: true };
}

// Helper: Calculate embedding
async function calculateEmbedding(text: string, openai: OpenAI): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0]?.embedding || [];
  } catch (err) {
    console.error('Error calculating embedding:', err);
    return [];
  }
}

// Helper: Generate canonical intent from question
async function generateCanonicalIntent(question: string, openai: OpenAI): Promise<string> {
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
          content: question,
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
    console.error('Intent generation failed:', error);
    throw new Error('Failed to generate intent');
  }
}

// Helper: JSON response
function jsonResponse(data: any, status: number = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Helper: Reset SQLite auto-increment sequence for a table
async function resetSequence(db: any, tableName: string) {
  try {
    await db.execute({
      sql: `DELETE FROM sqlite_sequence WHERE name = ?`,
      args: [tableName]
    });
  } catch (e) {
    // sqlite_sequence may not exist if table never had auto-increment inserts
    console.log(`[DB] Could not reset sequence for ${tableName}:`, e);
  }
}

// Helper: Error response
function errorResponse(message: string, status: number = 500, details?: string) {
  return jsonResponse({ error: message, ...(details && { details }) }, status);
}

export default async function handler(req: Request) {
  // Log request for Vercel visibility
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  console.log(`[API_REQUEST] ${method} ${path}`);

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

    // Get OpenAI client (for embeddings)
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

    // Parse URL - Vercel automatically handles /api/* routing
    const url = new URL(req.url);
    let path = url.pathname;
    const method = req.method;

    // Vercel catch-all routes: normalize path to always start with /api/
    // The path could be: /api/users/xxx, /users/xxx, or users/xxx depending on config
    if (!path.startsWith('/api')) {
      if (path.startsWith('/')) {
        path = '/api' + path;
      } else {
        path = '/api/' + path;
      }
    }

    // Route: /api/health
    if (path === '/api/health' && method === 'GET') {
      // Test database connection
      try {
        await db.execute('SELECT 1');
        return jsonResponse({
          status: 'ok',
          database: 'connected',
          env: {
            hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
            hasOpenAI: !!process.env.OPENAI_API_KEY
          }
        });
      } catch (dbError: any) {
        return jsonResponse({
          status: 'ok',
          database: 'error',
          error: dbError.message
        }, 200);
      }
    }

    // Route: /api/faqs
    if (path === '/api/faqs' && method === 'GET') {
      try {
        const data = await dbHelpers.selectAll(
          db,
          'faqs',
          'id, question, answer, intent, asked_count, embedding, embedding_updated_at, updated_at, created_at, media_ids',
          { column: 'created_at', ascending: false }
        );
        return jsonResponse(data || []);
      } catch (error: any) {
        if (error.message?.includes('no such table')) {
          return errorResponse('Tables not found. Please run the SQL schema in Turso database.', 500);
        }
        throw error;
      }
    }

    if (path === '/api/faqs' && method === 'POST') {
      const body = await req.json();
      const { question, answer, intent, media_ids } = body || {};

      if (!question || !answer) {
        return errorResponse('question and answer are required', 400);
      }

      if (!intent) {
        return errorResponse('intent is required', 400);
      }

      if (!openai) {
        return errorResponse('OpenAI API key not configured', 500);
      }

      // Generate embedding from intent (not question)
      const embedding = await calculateEmbedding(intent, openai);

      const data = await dbHelpers.insert(db, 'faqs', {
        question,
        answer,
        intent,
        embedding: JSON.stringify(embedding),
        embedding_updated_at: new Date().toISOString(),
        media_ids: JSON.stringify(media_ids || []),
        asked_count: 0,
      });

      return jsonResponse(data, 201);
    }

    if (path === '/api/faqs' && method === 'DELETE') {
      await dbHelpers.deleteAll(db, 'faqs');
      await resetSequence(db, 'faqs');
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Route: /api/faqs/:id
    const faqIdMatch = path.match(/^\/api\/faqs\/(\d+)$/);
    if (faqIdMatch && method === 'PUT') {
      const id = parseInt(faqIdMatch[1]);
      const body = await req.json();
      const { question, answer, intent, media_ids } = body || {};

      if (!question || !answer) {
        return errorResponse('question and answer are required', 400);
      }

      if (!intent) {
        return errorResponse('intent is required', 400);
      }

      // Fetch existing FAQ
      const existingFaq = await dbHelpers.selectOne(db, 'faqs', { column: 'id', value: id });
      if (!existingFaq) return errorResponse('FAQ not found', 404);

      const intentChanged = existingFaq.intent !== intent;
      const needsEmbeddingRecalc = intentChanged;

      const updateData: any = {
        question,
        answer,
        intent,
        updated_at: new Date().toISOString(),
      };

      if (media_ids !== undefined) {
        updateData.media_ids = JSON.stringify(media_ids);
      }

      if (needsEmbeddingRecalc && openai) {
        // Generate embedding from intent (not question)
        const embedding = await calculateEmbedding(intent, openai);
        updateData.embedding = JSON.stringify(embedding);
        updateData.embedding_updated_at = new Date().toISOString();
      }

      const data = await dbHelpers.update(db, 'faqs', updateData, { column: 'id', value: id });
      if (!data) return errorResponse('FAQ not found', 404);
      return jsonResponse(data);
    }

    if (faqIdMatch && method === 'DELETE') {
      const id = parseInt(faqIdMatch[1]);
      await dbHelpers.deleteWhere(db, 'faqs', { column: 'id', value: id });
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Route: /api/faqs/:id/increment
    const faqIncrementMatch = path.match(/^\/api\/faqs\/(\d+)\/increment$/);
    if (faqIncrementMatch && method === 'POST') {
      const id = parseInt(faqIncrementMatch[1]);

      const current = await dbHelpers.selectOne(db, 'faqs', { column: 'id', value: id });
      if (!current) {
        return errorResponse('FAQ not found', 404);
      }

      await dbHelpers.update(db, 'faqs', { asked_count: (current.asked_count || 0) + 1 }, { column: 'id', value: id });
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Route: /api/faqs/generate-intent
    if (path === '/api/faqs/generate-intent' && method === 'POST') {
      const body = await req.json();
      const { question } = body || {};

      if (!question) {
        return errorResponse('question is required', 400);
      }

      if (!openai) {
        return errorResponse('OpenAI API key not configured', 500);
      }

      try {
        const intent = await generateCanonicalIntent(question, openai);
        return jsonResponse({ intent });
      } catch (error: any) {
        return errorResponse(error.message || 'Failed to generate intent', 500);
      }
    }

    // Route: /api/media
    if (path === '/api/media' && method === 'GET') {
      try {
        const data = await dbHelpers.selectAll(
          db,
          'media',
          'id, title, type, url, created_at',
          { column: 'created_at', ascending: false }
        );
        return jsonResponse(data || []);
      } catch (error: any) {
        if (error.message?.includes('no such table')) {
          return errorResponse('Tables not found. Please run the SQL schema in Turso database.', 500);
        }
        throw error;
      }
    }

    if (path === '/api/media' && method === 'POST') {
      const body = await req.json();
      const { title, url, type } = body || {};

      if (!title || !url || !type) {
        return errorResponse('title, url and type are required', 400);
      }

      const data = await dbHelpers.insert(db, 'media', { title, url, type });
      return jsonResponse(data, 201);
    }

    if (path === '/api/media' && method === 'DELETE') {
      await dbHelpers.deleteAll(db, 'media');
      await resetSequence(db, 'media');
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Route: /api/media/:id
    const mediaIdMatch = path.match(/^\/api\/media\/(\d+)$/);
    if (mediaIdMatch && method === 'PUT') {
      const id = parseInt(mediaIdMatch[1]);
      const body = await req.json();
      const { title, url, type } = body || {};

      if (!title || !url || !type) {
        return errorResponse('title, url and type are required', 400);
      }

      const data = await dbHelpers.update(db, 'media', { title, url, type }, { column: 'id', value: id });
      if (!data) return errorResponse('Media not found', 404);
      return jsonResponse(data);
    }

    if (mediaIdMatch && method === 'DELETE') {
      const id = parseInt(mediaIdMatch[1]);
      await dbHelpers.deleteWhere(db, 'media', { column: 'id', value: id });
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Route: /api/stats
    if (path === '/api/stats' && method === 'GET') {
      const [totalMessages, uniqueUsers, totalFaqs, timeResult] = await Promise.all([
        dbHelpers.count(db, 'chat_messages', { column: 'sender', value: 'user' }),
        dbHelpers.count(db, 'conversations'),
        dbHelpers.count(db, 'faqs'),
        dbHelpers.selectAll(db, 'chat_messages', 'conversation_id, created_at'),
      ]);

      let conversationTime = 0;
      if (timeResult && timeResult.length > 0) {
        // Group messages by conversation_id
        const messagesByConv: Record<number, any[]> = {};
        timeResult.forEach((msg: any) => {
          if (!messagesByConv[msg.conversation_id]) {
            messagesByConv[msg.conversation_id] = [];
          }
          messagesByConv[msg.conversation_id].push(msg);
        });

        // Calculate actual time spent per conversation: sum of gaps between consecutive messages
        const MAX_GAP_SECONDS = 300; // 5 minutes - cap gaps to exclude long breaks

        conversationTime = Math.round(
          Object.values(messagesByConv).reduce((totalSum, messages) => {
            if (messages.length < 2) return totalSum;

            // Sort messages by timestamp
            const sorted = [...messages].sort((a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            let convTime = 0;
            for (let i = 1; i < sorted.length; i++) {
              const prevTime = new Date(sorted[i - 1].created_at).getTime();
              const currTime = new Date(sorted[i].created_at).getTime();
              const gapSeconds = Math.round((currTime - prevTime) / 1000);

              // Only count gaps up to MAX_GAP_SECONDS (active time)
              if (gapSeconds > 0 && gapSeconds <= MAX_GAP_SECONDS) {
                convTime += gapSeconds;
              }
            }

            return totalSum + convTime;
          }, 0)
        );
      }

      return jsonResponse({
        totalMessages,
        uniqueUsers,
        totalFaqs,
        conversationTime,
      });
    }

    // Route: /api/users/:id
    const userIdMatch = path.match(/^\/api\/users\/([^/]+)$/);
    if (userIdMatch && method === 'GET') {
      const id = userIdMatch[1];
      const data = await dbHelpers.selectOne(db, 'users', { column: 'id', value: id });
      if (!data) return errorResponse('User not found', 404);
      return jsonResponse({ id: data.id, name: data.name, created_at: data.created_at });
    }

    if (path === '/api/users' && method === 'POST') {
      const body = await req.json();
      const { name } = body || {};

      if (!name) {
        return errorResponse('name is required', 400);
      }

      // Generate UUID for user id
      const userId = crypto.randomUUID();
      const data = await dbHelpers.insert(db, 'users', {
        id: userId,
        name,
        created_at: new Date().toISOString()
      });
      return jsonResponse(data, 201);
    }

    // Route: /api/users/:id/conversations
    const userConversationsMatch = path.match(/^\/api\/users\/([^/]+)\/conversations$/);
    if (userConversationsMatch && method === 'GET') {
      const id = userConversationsMatch[1];

      // First verify the user exists
      const user = await dbHelpers.selectOne(db, 'users', { column: 'id', value: id });
      if (!user) {
        // Return empty array for non-existent user (graceful handling)
        return jsonResponse([]);
      }

      const data = await dbHelpers.selectWhereOr(
        db,
        'conversations',
        { column: 'user_id', value: id },
        [
          { column: 'is_deleted_by_user', value: null },
          { column: 'is_deleted_by_user', value: false }
        ],
        'id, user_id, created_at, title, is_deleted_by_user',
        { column: 'created_at', ascending: false }
      );
      return jsonResponse(data || []);
    }

    // Route: /api/conversations
    if (path === '/api/conversations' && method === 'POST') {
      const body = await req.json();
      const { userId, title } = body || {};

      if (!userId || !title) {
        return errorResponse('userId and title are required', 400);
      }

      const data = await dbHelpers.insert(db, 'conversations', { user_id: userId, title });
      return jsonResponse(data, 201);
    }

    if (path === '/api/conversations' && method === 'GET') {
      const adminCheck = requireAdmin(req);
      if (!adminCheck.authorized) return errorResponse(adminCheck.error || 'Access denied', 403);

      try {
        const result = await db.execute(`
          SELECT 
            c.id, c.user_id, c.created_at, c.title, c.is_deleted_by_user,
            u.id as user_id_joined, u.name as user_name, u.created_at as user_created_at
          FROM conversations c
          LEFT JOIN users u ON c.user_id = u.id
          ORDER BY c.created_at DESC
        `);

        const conversations = result.rows.map((row: any) => ({
          id: row.id,
          user_id: row.user_id,
          created_at: row.created_at,
          title: row.title,
          is_deleted_by_user: row.is_deleted_by_user,
          user: row.user_id_joined ? {
            id: row.user_id_joined,
            name: row.user_name,
            created_at: row.user_created_at
          } : null
        }));

        return jsonResponse(conversations);
      } catch (error: any) {
        return errorResponse(error.message || 'Failed to fetch conversations', 500);
      }
    }

    // Route: /api/conversations/:id
    const conversationIdMatch = path.match(/^\/api\/conversations\/(\d+)$/);
    if (conversationIdMatch && method === 'PATCH') {
      const id = parseInt(conversationIdMatch[1]);
      const body = await req.json();
      const { isDeletedByUser } = body || {};

      await dbHelpers.update(db, 'conversations', { is_deleted_by_user: Boolean(isDeletedByUser) }, { column: 'id', value: id });
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Route: /api/conversations/:id/messages
    const conversationMessagesMatch = path.match(/^\/api\/conversations\/(\d+)\/messages$/);
    if (conversationMessagesMatch && method === 'GET') {
      const id = parseInt(conversationMessagesMatch[1]);
      const data = await dbHelpers.selectWhere(
        db,
        'chat_messages',
        { column: 'conversation_id', value: id },
        'id, conversation_id, sender, text, media_urls, query_id, suggestions_json, created_at',
        { column: 'created_at', ascending: true }
      );
      return jsonResponse(data || []);
    }

    // Route: /api/messages
    if (path === '/api/messages' && method === 'POST') {
      const body = await req.json();
      const { conversationId, sender, text, mediaUrls, queryId, suggestions } = body || {};

      console.log('[API_MESSAGES] Creating message with suggestions:', suggestions ? suggestions.length : 0);

      if (!conversationId || !sender || !text) {
        return errorResponse('conversationId, sender and text are required', 400);
      }

      try {
        console.log('[API_MESSAGES] Saving with suggestions_json:', suggestions && suggestions.length > 0 ? `${suggestions.length} chips` : 'none');
        const data = await dbHelpers.insert(db, 'chat_messages', {
          conversation_id: conversationId,
          sender,
          text,
          media_urls: JSON.stringify(mediaUrls || []),
          query_id: queryId || null,
          suggestions_json: suggestions && suggestions.length > 0 ? JSON.stringify(suggestions) : null,
        });
        console.log('[API_MESSAGES] Insert SUCCESS with suggestions');
        return jsonResponse(data, 201);
      } catch (insertErr: any) {
        console.error('[API_MESSAGES] Insert error:', insertErr.message);
        // If suggestions_json column doesn't exist, retry without it
        if (insertErr.message && insertErr.message.includes('suggestions_json')) {
          console.log('[API_MESSAGES] FALLBACK - suggestions_json column not found, retrying without');
          const data = await dbHelpers.insert(db, 'chat_messages', {
            conversation_id: conversationId,
            sender,
            text,
            media_urls: JSON.stringify(mediaUrls || []),
            query_id: queryId || null,
          });
          return jsonResponse(data, 201);
        }
        throw insertErr;
      }
    }

    // Route: /api/reports
    if (path === '/api/reports' && method === 'POST') {
      const body = await req.json();
      const { conversationId, queryId, category, otherReason, message } = body || {};

      if (!queryId || !category) {
        return errorResponse('queryId and category are required', 400);
      }

      try {
        const data = await dbHelpers.insert(db, 'user_reports', {
          conversation_id: conversationId,
          query_id: queryId,
          category,
          other_reason: otherReason,
          message_snapshot: message,
          status: 'pending',
          created_at: new Date().toISOString()
        });
        return jsonResponse(data, 201);
      } catch (error: any) {
        return errorResponse(error.message || 'Failed to create report', 500);
      }
    }

    if (path === '/api/reports' && method === 'GET') {
      const adminCheck = requireAdmin(req);
      if (!adminCheck.authorized) return errorResponse(adminCheck.error || 'Access denied', 403);

      const data = await dbHelpers.selectAll(db, 'user_reports', '*', { column: 'created_at', ascending: false });
      return jsonResponse({ success: true, reports: data || [] });
    }

    if (path === '/api/reports' && method === 'DELETE') {
      const adminCheck = requireAdmin(req);
      if (!adminCheck.authorized) return errorResponse(adminCheck.error || 'Access denied', 403);

      const body = await req.json().catch(() => ({}));
      const { id } = body || {};

      if (id) {
        await dbHelpers.deleteWhere(db, 'user_reports', { column: 'id', value: id });
        return jsonResponse({ success: true, message: 'Report deleted' });
      } else {
        await dbHelpers.deleteAll(db, 'user_reports');
        await resetSequence(db, 'user_reports');
        return jsonResponse({ success: true, message: 'All reports cleared' });
      }
    }

    // Route: /api/reports/:id/status
    const reportStatusMatch = path.match(/^\/api\/reports\/(\d+)\/status$/);
    if (reportStatusMatch && method === 'PUT') {
      const adminCheck = requireAdmin(req);
      if (!adminCheck.authorized) return errorResponse(adminCheck.error || 'Access denied', 403);

      const id = parseInt(reportStatusMatch[1]);
      const body = await req.json();
      const { status } = body || {};

      if (!status) return errorResponse('status is required', 400);

      const data = await dbHelpers.update(db, 'user_reports', { status }, { column: 'id', value: id });
      return jsonResponse({ success: true, report: data });
    }

    // Route: /api/reports/categories
    if (path === '/api/reports/categories' && method === 'GET') {
      try {
        const data = await db.execute({
          sql: "SELECT name, display_order FROM report_categories ORDER BY display_order ASC, name ASC"
        });
        return jsonResponse({
          success: true,
          categories: (data.rows || []).map((r: any) => ({ name: r.name, order: r.display_order }))
        });
      } catch (error: any) {
        if (error.message?.includes('no such table')) {
          return jsonResponse({ success: true, categories: [] });
        }
        throw error;
      }
    }

    if (path === '/api/reports/categories' && method === 'POST') {
      const adminCheck = requireAdmin(req);
      if (!adminCheck.authorized) return errorResponse(adminCheck.error || 'Access denied', 403);

      const body = await req.json();
      const { name } = body || {};

      if (!name || !name.trim()) {
        return errorResponse('Category name is required', 400);
      }

      const maxOrderResult = await db.execute({
        sql: "SELECT display_order FROM report_categories ORDER BY display_order DESC LIMIT 1"
      });
      const maxOrder = maxOrderResult.rows[0] as any;
      const newOrder = (maxOrder?.display_order ?? -1) + 1;

      const data = await dbHelpers.insert(db, 'report_categories', {
        name: name.trim().toLowerCase(),
        display_order: newOrder
      });
      return jsonResponse({ success: true, category: data });
    }

    if (path === '/api/reports/categories' && method === 'DELETE') {
      const adminCheck = requireAdmin(req);
      if (!adminCheck.authorized) return errorResponse(adminCheck.error || 'Access denied', 403);

      const body = await req.json();
      const { name } = body || {};

      if (!name) {
        return errorResponse('Category name is required', 400);
      }

      await dbHelpers.deleteWhere(db, 'report_categories', { column: 'name', value: name });
      return jsonResponse({ success: true });
    }

    // Route: /api/reports/categories/reorder
    if (path === '/api/reports/categories/reorder' && method === 'POST') {
      const adminCheck = requireAdmin(req);
      if (!adminCheck.authorized) return errorResponse(adminCheck.error || 'Access denied', 403);

      const body = await req.json();
      const { name, sourceIndex, targetIndex } = body || {};

      if (!name || sourceIndex === undefined || targetIndex === undefined) {
        return errorResponse('name, sourceIndex, and targetIndex are required', 400);
      }

      const categoriesResult = await db.execute({
        sql: "SELECT name, display_order FROM report_categories ORDER BY display_order ASC"
      });
      const categories = categoriesResult.rows as any[];
      if (!categories || categories.length === 0) return errorResponse('No categories found', 404);

      const reordered = [...categories];
      const [removed] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, removed);

      for (let i = 0; i < reordered.length; i++) {
        await dbHelpers.update(db, 'report_categories', { display_order: i }, { column: 'name', value: reordered[i].name });
      }

      return jsonResponse({ success: true });
    }

    // Route: /api/reset-all-user-data
    if (path === '/api/reset-all-user-data' && method === 'DELETE') {
      const adminCheck = requireAdmin(req);
      if (!adminCheck.authorized) return errorResponse(adminCheck.error || 'Access denied', 403);

      try {
        // Order matters for foreign keys
        await db.execute("DELETE FROM user_reports");
        await resetSequence(db, 'user_reports');

        await db.execute("DELETE FROM chat_messages");
        await resetSequence(db, 'chat_messages');

        await db.execute("DELETE FROM conversations");
        await resetSequence(db, 'conversations');

        await db.execute("DELETE FROM users");
        await resetSequence(db, 'users');

        // Reset FAQ asked counts
        await db.execute("UPDATE faqs SET asked_count = 0");

        return jsonResponse({ success: true, message: 'All user data has been reset' });
      } catch (error: any) {
        console.error('Reset user data failed:', error);
        return errorResponse('Failed to reset user data', 500, error.message);
      }
    }

    // Route: /api/settings/cache - GET and PUT
    if (path === '/api/settings/cache') {
      const adminCheck = requireAdmin(req);
      if (!adminCheck.authorized) return errorResponse(adminCheck.error || 'Access denied', 403);

      if (method === 'GET') {
        try {
          const setting = await dbHelpers.selectOne(db, 'app_settings', { column: 'key', value: 'cache_enabled' });
          const enabled = setting?.value !== 'false';
          return jsonResponse({ enabled });
        } catch (error: any) {
          console.error('Get cache status failed:', error);
          return jsonResponse({ enabled: true }); // Default to enabled
        }
      }

      if (method === 'PUT') {
        try {
          const body = await req.json();
          const enabled = body.enabled !== false;

          // Check if setting exists
          const existing = await dbHelpers.selectOne(db, 'app_settings', { column: 'key', value: 'cache_enabled' });

          if (existing) {
            await dbHelpers.update(db, 'app_settings', { value: String(enabled) }, { column: 'key', value: 'cache_enabled' });
          } else {
            await dbHelpers.insert(db, 'app_settings', { key: 'cache_enabled', value: String(enabled) });
          }

          return jsonResponse({ success: true, enabled });
        } catch (error: any) {
          console.error('Update cache status failed:', error);
          return errorResponse('Failed to update cache status', 500, error.message);
        }
      }
    }

    // 404 for unmatched routes
    console.log(`[API] 404 - No route matched: ${method} ${path}`);
    return errorResponse('Not found', 404);
  } catch (error: any) {
    console.error('API function error:', error);
    console.error('Error stack:', error.stack);
    console.error('Request path:', req.url);
    return errorResponse('Internal server error', 500, error.message);
  }
}

