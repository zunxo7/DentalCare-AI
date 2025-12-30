// Vercel Edge Function: Main API endpoint (catch-all route)
// Handles all /api/* routes

import { createClient } from '@libsql/client';
import OpenAI from 'openai';
import * as dbHelpers from '../lib/dbHelpers.js';

export const config = { runtime: 'edge' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-password',
};

// Helper: Get admin password from env or header
function getAdminPassword(req: Request): string | null {
  const headerPassword = req.headers.get('x-admin-password');
  if (headerPassword) return headerPassword;
  return process.env.ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD || null;
}

// Helper: Check if request requires admin
function requireAdmin(req: Request): { authorized: boolean; error?: string } {
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD;
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

// Helper: JSON response
function jsonResponse(data: any, status: number = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Helper: Error response
function errorResponse(message: string, status: number = 500, details?: string) {
  return jsonResponse({ error: message, ...(details && { details }) }, status);
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
          'id, question, answer, asked_count, embedding, embedding_updated_at, updated_at, created_at, media_ids',
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
      const { question, answer, media_ids } = body || {};

      if (!question || !answer) {
        return errorResponse('question and answer are required', 400);
      }

      if (!openai) {
        return errorResponse('OpenAI API key not configured', 500);
      }

      const embedding = await calculateEmbedding(question, openai);
      
      const data = await dbHelpers.insert(db, 'faqs', {
        question,
        answer,
        embedding: JSON.stringify(embedding),
        embedding_updated_at: new Date().toISOString(),
        media_ids: JSON.stringify(media_ids || []),
        asked_count: 0,
      });

      return jsonResponse(data, 201);
    }

    if (path === '/api/faqs' && method === 'DELETE') {
      await dbHelpers.deleteAll(db, 'faqs');
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Route: /api/faqs/:id
    const faqIdMatch = path.match(/^\/api\/faqs\/(\d+)$/);
    if (faqIdMatch && method === 'PUT') {
      const id = parseInt(faqIdMatch[1]);
      const body = await req.json();
      const { question, answer, media_ids } = body || {};

      if (!question || !answer) {
        return errorResponse('question and answer are required', 400);
      }

      // Fetch existing FAQ
      const existingFaq = await dbHelpers.selectOne(db, 'faqs', { column: 'id', value: id });
      if (!existingFaq) return errorResponse('FAQ not found', 404);

      const questionChanged = existingFaq.question !== question;
      const answerChanged = existingFaq.answer !== answer;
      const needsEmbeddingRecalc = questionChanged || answerChanged;

      const updateData: any = {
        question,
        answer,
        updated_at: new Date().toISOString(),
      };
      
      if (media_ids !== undefined) {
        updateData.media_ids = JSON.stringify(media_ids);
      }

      if (needsEmbeddingRecalc && openai) {
        const embedding = await calculateEmbedding(question, openai);
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
        const timeByConv: Record<number, { min: string; max: string }> = {};
        timeResult.forEach((msg: any) => {
          if (!timeByConv[msg.conversation_id]) {
            timeByConv[msg.conversation_id] = { min: msg.created_at, max: msg.created_at };
          } else {
            if (new Date(msg.created_at) < new Date(timeByConv[msg.conversation_id].min)) {
              timeByConv[msg.conversation_id].min = msg.created_at;
            }
            if (new Date(msg.created_at) > new Date(timeByConv[msg.conversation_id].max)) {
              timeByConv[msg.conversation_id].max = msg.created_at;
            }
          }
        });
        
        conversationTime = Math.round(
          Object.values(timeByConv).reduce((sum, conv) => {
            const diff = (new Date(conv.max).getTime() - new Date(conv.min).getTime()) / 1000;
            return sum + diff;
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
        'id, conversation_id, sender, text, media_urls, query_id, created_at',
        { column: 'created_at', ascending: true }
      );
      return jsonResponse(data || []);
    }

    // Route: /api/messages
    if (path === '/api/messages' && method === 'POST') {
      const body = await req.json();
      const { conversationId, sender, text, mediaUrls, queryId } = body || {};

      if (!conversationId || !sender || !text) {
        return errorResponse('conversationId, sender and text are required', 400);
      }

      const data = await dbHelpers.insert(db, 'chat_messages', {
        conversation_id: conversationId,
        sender,
        text,
        media_urls: JSON.stringify(mediaUrls || []),
        query_id: queryId || null,
      });
      return jsonResponse(data, 201);
    }

    // Route: /api/admin/conversations-with-users
    if (path === '/api/admin/conversations-with-users' && method === 'GET') {
      const conversations = await dbHelpers.selectAll(
        db,
        'conversations',
        'id, user_id, created_at, title, is_deleted_by_user',
        { column: 'created_at', ascending: false }
      );
      
      const userIds = [...new Set(conversations.map((c: any) => c.user_id))];
      const users = userIds.length > 0 
        ? await dbHelpers.selectWhereIn(db, 'users', { column: 'id', values: userIds }, 'id, name, created_at')
        : [];
      
      const userMap: Record<string, any> = {};
      users.forEach((u: any) => { userMap[u.id] = u; });
      
      const mapped = conversations.map((c: any) => ({
        id: c.id,
        user_id: c.user_id,
        created_at: c.created_at,
        title: c.title,
        is_deleted_by_user: c.is_deleted_by_user,
        user: userMap[c.user_id] || null,
      }));

      return jsonResponse(mapped);
    }

    // Route: /api/reset-all-user-data
    if (path === '/api/reset-all-user-data' && method === 'POST') {
      await dbHelpers.deleteAll(db, 'chat_messages');
      await dbHelpers.deleteAll(db, 'conversations');
      // Delete all users except the default one
      await db.execute({ sql: "DELETE FROM users WHERE id != ?", args: ['00000000-0000-0000-0000-000000000000'] });
      
      const faqs = await dbHelpers.selectAll(db, 'faqs', 'id');
      if (faqs && faqs.length > 0) {
        await Promise.all(
          faqs.map((faq: any) => 
            dbHelpers.update(db, 'faqs', { asked_count: 0 }, { column: 'id', value: faq.id })
          )
        );
      }
      
      return jsonResponse({ success: true });
    }

    // Route: /api/reports
    if (path === '/api/reports' && method === 'POST') {
      const body = await req.json();
      const { userId, queryId, reportType, userQuery, botResponse } = body || {};
      
      if (!reportType || !reportType.trim()) {
        return errorResponse('Report type is required', 400);
      }

      if (!queryId || !queryId.trim()) {
        return errorResponse('queryId is required for all reports', 400);
      }

      // Find bot message with this queryId
      const botMessages = await db.execute({
        sql: "SELECT id, conversation_id, text, created_at FROM chat_messages WHERE query_id = ? AND sender = 'bot' ORDER BY created_at DESC LIMIT 1",
        args: [queryId]
      });
      const botMessage = botMessages.rows[0] as any;
      
      let finalUserQuery = userQuery || null;
      let finalBotResponse = botResponse || null;
      
      if (botMessage) {
        finalBotResponse = botMessage.text;
        
        const userMessages = await db.execute({
          sql: "SELECT text FROM chat_messages WHERE conversation_id = ? AND sender = 'user' AND created_at < ? ORDER BY created_at DESC LIMIT 1",
          args: [botMessage.conversation_id, botMessage.created_at]
        });
        const userMessage = userMessages.rows[0] as any;
        
        if (userMessage) {
          finalUserQuery = userMessage.text;
        }
      }
      
      const data = await dbHelpers.insert(db, 'user_reports', {
        user_id: userId || null,
        query_id: queryId,
        report_type: reportType,
        user_query: finalUserQuery,
        bot_response: finalBotResponse,
      });

      return jsonResponse({ success: true, report: data });
    }

    if (path === '/api/reports' && method === 'GET') {
      const adminCheck = requireAdmin(req);
      if (!adminCheck.authorized) {
        return errorResponse(adminCheck.error || 'Access denied', 403);
      }

      const reports = await db.execute({
        sql: "SELECT ur.*, u.name as user_name FROM user_reports ur LEFT JOIN users u ON ur.user_id = u.id ORDER BY ur.created_at DESC LIMIT 500"
      });

      const mappedReports = (reports.rows || []).map((report: any) => ({
        ...report,
        user_name: report.user_name || null,
      }));

      return jsonResponse({ success: true, reports: mappedReports });
    }

    if (path === '/api/reports' && method === 'DELETE') {
      const adminCheck = requireAdmin(req);
      if (!adminCheck.authorized) {
        return errorResponse(adminCheck.error || 'Access denied', 403);
      }

      await dbHelpers.deleteAll(db, 'user_reports');
      return jsonResponse({ success: true, message: 'All reports cleared' });
    }

    // Route: /api/reports/:id
    const reportIdMatch = path.match(/^\/api\/reports\/(\d+)$/);
    if (reportIdMatch && method === 'DELETE') {
      const adminCheck = requireAdmin(req);
      if (!adminCheck.authorized) {
        return errorResponse(adminCheck.error || 'Access denied', 403);
      }

      const id = parseInt(reportIdMatch[1]);
      const data = await db.execute({
        sql: "DELETE FROM user_reports WHERE id = ? RETURNING *",
        args: [id]
      });
      if (!data.rows[0]) return errorResponse('Report not found', 404);
      return jsonResponse({ success: true, message: 'Report deleted' });
    }

    // Route: /api/reports/:id/status
    const reportStatusMatch = path.match(/^\/api\/reports\/(\d+)\/status$/);
    if (reportStatusMatch && method === 'PUT') {
      const adminCheck = requireAdmin(req);
      if (!adminCheck.authorized) {
        return errorResponse(adminCheck.error || 'Access denied', 403);
      }

      const id = parseInt(reportStatusMatch[1]);
      const body = await req.json();
      const { status } = body || {};
      
      if (!status || !['active', 'resolved'].includes(status)) {
        return errorResponse('Valid status (active, resolved) is required', 400);
      }

      const data = await dbHelpers.update(db, 'user_reports', { status }, { column: 'id', value: id });
      if (!data) return errorResponse('Report not found', 404);
      return jsonResponse({ success: true, report: data });
    }

    // Route: /api/report-categories
    if (path === '/api/report-categories' && method === 'GET') {
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

    // Route: /api/debug/* (admin only)
    if (path.startsWith('/api/debug/')) {
      const adminCheck = requireAdmin(req);
      if (!adminCheck.authorized) {
        return errorResponse(adminCheck.error || 'Access denied', 403);
      }

      // /api/debug/report-categories
      if (path === '/api/debug/report-categories' && method === 'GET') {
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

      if (path === '/api/debug/report-categories' && method === 'POST') {
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

      if (path === '/api/debug/report-categories' && method === 'DELETE') {
        const body = await req.json();
        const { name } = body || {};

        if (!name) {
          return errorResponse('Category name is required', 400);
        }

        await dbHelpers.deleteWhere(db, 'report_categories', { column: 'name', value: name });
        return jsonResponse({ success: true });
      }

      // /api/debug/report-categories/reorder
      if (path === '/api/debug/report-categories/reorder' && method === 'POST') {
        const body = await req.json();
        const { name, sourceIndex, targetIndex } = body || {};

        if (!name || sourceIndex === undefined || targetIndex === undefined) {
          return errorResponse('name, sourceIndex, and targetIndex are required', 400);
        }

        // Get all categories ordered
        const categoriesResult = await db.execute({
          sql: "SELECT name, display_order FROM report_categories ORDER BY display_order ASC"
        });
        const categories = categoriesResult.rows as any[];
        if (!categories || categories.length === 0) return errorResponse('No categories found', 404);

        // Reorder in memory
        const reordered = [...categories];
        const [removed] = reordered.splice(sourceIndex, 1);
        reordered.splice(targetIndex, 0, removed);

        // Update all display_order values
        for (let i = 0; i < reordered.length; i++) {
          await dbHelpers.update(db, 'report_categories', { display_order: i }, { column: 'name', value: reordered[i].name });
        }

        return jsonResponse({ success: true });
      }

      // /api/debug/delete-row
      if (path === '/api/debug/delete-row' && method === 'DELETE') {
        const body = await req.json();
        const { table, idColumn, id } = body || {};

        if (!table || !idColumn || id === undefined || id === null) {
          return errorResponse('table, idColumn, and id are required', 400);
        }

        const tableMap: Record<string, string> = {
          faqs: 'faqs',
          media: 'media',
          users: 'users',
          conversations: 'conversations',
          messages: 'chat_messages',
          reports: 'user_reports',
        };

        const dbTableName = tableMap[table];
        if (!dbTableName) {
          return errorResponse('Invalid table name', 400);
        }

        const data = await db.execute({
          sql: `DELETE FROM ${dbTableName} WHERE ${idColumn} = ? RETURNING ${idColumn}`,
          args: [id]
        });
        if (!data.rows[0]) return errorResponse('Row not found', 404);
        return jsonResponse({ success: true, deletedId: (data.rows[0] as any)[idColumn] });
      }

      // /api/debug/copy-row
      if (path === '/api/debug/copy-row' && method === 'POST') {
        const body = await req.json();
        const { table, idColumn, id } = body || {};

        if (!table || !idColumn || id === undefined || id === null) {
          return errorResponse('table, idColumn, and id are required', 400);
        }

        const tableMap: Record<string, string> = {
          faqs: 'faqs',
          media: 'media',
          users: 'users',
          conversations: 'conversations',
          messages: 'chat_messages',
          reports: 'user_reports',
        };

        const dbTableName = tableMap[table];
        if (!dbTableName) {
          return errorResponse('Invalid table name', 400);
        }

        const rowData = await dbHelpers.selectOne(db, dbTableName, { column: idColumn, value: id });
        if (!rowData) return errorResponse('Row not found', 404);

        const row = rowData as any;
        const insertData: any = {};
        Object.keys(row).forEach(col => {
          if (col !== idColumn && col !== 'created_at') {
            insertData[col] = row[col];
          }
        });

        if (table === 'faqs' && row.question && openai) {
          const embedding = await calculateEmbedding(row.question, openai);
          insertData.embedding = JSON.stringify(embedding);
          insertData.embedding_updated_at = new Date().toISOString();
        }

        const newRow = await dbHelpers.insert(db, dbTableName, insertData);
        return jsonResponse({ success: true, newRow });
      }

      // /api/debug/update-cell
      if (path === '/api/debug/update-cell' && method === 'POST') {
        const body = await req.json();
        const { table, idColumn, id, column, value } = body || {};

        if (!table || !idColumn || id === undefined || id === null || !column || value === undefined) {
          return errorResponse('table, idColumn, id, column, and value are required', 400);
        }

        const tableMap: Record<string, string> = {
          faqs: 'faqs',
          media: 'media',
          users: 'users',
          conversations: 'conversations',
          messages: 'chat_messages',
          reports: 'user_reports',
        };

        const dbTableName = tableMap[table];
        if (!dbTableName) {
          return errorResponse('Invalid table name', 400);
        }

        const protectedColumns = ['created_at', 'embedding'];
        if (protectedColumns.includes(column.toLowerCase())) {
          return errorResponse(`Cannot edit protected column: ${column}`, 400);
        }

        const validColumnName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column);
        if (!validColumnName) {
          return errorResponse('Invalid column name', 400);
        }

        const updateData: any = { [column]: value };
        
        if (dbTableName === 'faqs' && (column === 'question' || column === 'answer')) {
          updateData.updated_at = new Date().toISOString();
        }

        const data = await dbHelpers.update(db, dbTableName, updateData, { column: idColumn, value: id });
        if (!data) return errorResponse('Row not found', 404);
        return jsonResponse({ success: true });
      }

      // Note: Some debug endpoints (delete-column, reset-sequence, relationships, run-query) 
      // require raw SQL which isn't easily available in Edge Functions.
    }

    // 404 for unmatched routes
    // #region agent log
    console.log('[EDGE_FUNCTION] No route matched - 404:', path, method);
    fetch('http://127.0.0.1:7245/ingest/35e17c82-2512-4435-b85b-260a0eb4f0be',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/[...path].ts:881',message:'No route matched - returning 404',data:{path,method},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return errorResponse('Not found', 404);
  } catch (error: any) {
    console.error('API function error:', error);
    console.error('Error stack:', error.stack);
    console.error('Request path:', req.url);
    return errorResponse('Internal server error', 500, error.message);
  }
}

