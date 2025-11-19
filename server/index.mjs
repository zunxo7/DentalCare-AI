import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pkg from 'pg';
import OpenAI from 'openai';
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    '[server] DATABASE_URL is not set. Set it to your Render Postgres connection string.'
  );
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

// OpenAI client for embeddings
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Calculate embedding for FAQ question
async function calculateEmbedding(text) {
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

async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

async function initDatabase() {
  console.log('[LOG] Ensuring database schema exists...');

  // Enable functions for UUIDs if available (safe to run repeatedly)
  await query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";', []).catch(() => {});

  // FAQs table
  await query(
    `CREATE TABLE IF NOT EXISTS faqs (
      id                  SERIAL PRIMARY KEY,
      question            TEXT NOT NULL,
      answer              TEXT NOT NULL,
      asked_count         INTEGER NOT NULL DEFAULT 0,
      embedding           REAL[],
      embedding_updated_at TIMESTAMPTZ,
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    []
  );

  // Force-add columns if table already existed before
  await query(
    `ALTER TABLE faqs 
        ADD COLUMN IF NOT EXISTS embedding REAL[];`,
    []
  );

  await query(
    `ALTER TABLE faqs 
        ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;`,
    []
  );

  await query(
    `ALTER TABLE faqs 
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`,
    []
  );

  await query(
    `ALTER TABLE faqs 
        ADD COLUMN IF NOT EXISTS asked_count INTEGER NOT NULL DEFAULT 0;`,
    []
  );

  // MEDIA table
  await query(
    `CREATE TABLE IF NOT EXISTS media (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL,
      type       TEXT NOT NULL CHECK (type IN ('video', 'image', 'document')),
      url        TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    []
  );

  // USERS
  await query(
    `CREATE TABLE IF NOT EXISTS users (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    []
  );

  // CONVERSATIONS
  await query(
    `CREATE TABLE IF NOT EXISTS conversations (
      id                 SERIAL PRIMARY KEY,
      user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      title              TEXT,
      is_deleted_by_user BOOLEAN NOT NULL DEFAULT FALSE
    );`,
    []
  );

  // MESSAGES
  await query(
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id              SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender          TEXT NOT NULL CHECK (sender IN ('user', 'bot')),
      text            TEXT NOT NULL,
      media_urls      TEXT[] NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    []
  );

  // indexes
  await query(
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id
     ON chat_messages (conversation_id, created_at);`,
    []
  );

  await query(
    `CREATE INDEX IF NOT EXISTS idx_conversations_user_id
     ON conversations (user_id, created_at);`,
    []
  );

  // DEBUG LOGS table
  await query(
    `CREATE TABLE IF NOT EXISTS debug_logs (
      id         SERIAL PRIMARY KEY,
      user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
      query_id    TEXT,
      message     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    []
  );

  // Drop metadata column if it exists (for existing databases)
  await query(
    `ALTER TABLE debug_logs DROP COLUMN IF EXISTS metadata;`,
    []
  );

  // Drop level column if it exists (for existing databases)
  await query(
    `ALTER TABLE debug_logs DROP COLUMN IF EXISTS level;`,
    []
  );

  await query(
    `ALTER TABLE debug_logs ADD COLUMN IF NOT EXISTS query_id TEXT;`,
    []
  );


  await query(
    `CREATE INDEX IF NOT EXISTS idx_debug_logs_created_at
     ON debug_logs (created_at DESC);`,
    []
  );


  await query(
    `CREATE INDEX IF NOT EXISTS idx_debug_logs_user_id
     ON debug_logs (user_id);`,
    []
  );

  await query(
    `CREATE INDEX IF NOT EXISTS idx_debug_logs_query_id
     ON debug_logs (query_id);`,
    []
  );

  // USER REPORTS table
  await query(
    `CREATE TABLE IF NOT EXISTS user_reports (
      id              SERIAL PRIMARY KEY,
      user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
      query_id        TEXT NOT NULL,
      report_type     TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    []
  );

  await query(
    `CREATE INDEX IF NOT EXISTS idx_user_reports_created_at
     ON user_reports (created_at DESC);`,
    []
  );

  // Add status column if it doesn't exist
  await query(
    `ALTER TABLE user_reports 
     ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';`,
    []
  );

  // Update constraint to allow 'checked' status if table already exists
  await query(
    `DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'user_reports_status_check'
      ) THEN
        ALTER TABLE user_reports DROP CONSTRAINT user_reports_status_check;
      END IF;
      ALTER TABLE user_reports ADD CONSTRAINT user_reports_status_check 
        CHECK (status IN ('active', 'resolved'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;`,
    []
  );

  await query(
    `CREATE INDEX IF NOT EXISTS idx_user_reports_query_id
     ON user_reports (query_id);`,
    []
  );

  await query(
    `CREATE INDEX IF NOT EXISTS idx_user_reports_user_id
     ON user_reports (user_id);`,
    []
  );

  // Remove any extra columns that are no longer in use
  // These columns may have existed in previous versions
  const extraColumnsToRemove = ['conversation_id', 'message_id', 'user_query', 'bot_response'];
  for (const column of extraColumnsToRemove) {
    try {
      await query(
        `ALTER TABLE user_reports DROP COLUMN IF EXISTS ${column}`,
        []
      );
    } catch (err) {
      // Column might not exist or might have dependencies, that's okay
      console.log(`[LOG] Could not drop column ${column} from user_reports:`, err.message);
    }
  }

  // REPORT CATEGORIES table
  await query(
    `CREATE TABLE IF NOT EXISTS report_categories (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    []
  );

  await query(
    `ALTER TABLE report_categories ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;`,
    []
  );

  // Insert default categories if they don't exist
  await query(
    `INSERT INTO report_categories (name) 
     SELECT unnest(ARRAY['answer_irrelevant', 'media_irrelevant', 'inappropriate'])
     WHERE NOT EXISTS (SELECT 1 FROM report_categories);`,
    []
  );

  // Remove CHECK constraint from user_reports (allow any category)
  // Note: PostgreSQL doesn't support DROP CONSTRAINT IF EXISTS directly, so we'll handle this gracefully
  try {
    await query(
      `ALTER TABLE user_reports DROP CONSTRAINT IF EXISTS user_reports_report_type_check;`,
      []
    );
  } catch (err) {
    // Constraint might not exist, that's okay
  }

  console.log('[LOG] Database schema ready.');
}

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Simple health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// -----------------------------------------------------------------------------
// FAQs
// -----------------------------------------------------------------------------

app.get('/api/faqs', async (_req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, question, answer, asked_count, embedding, embedding_updated_at, updated_at, created_at FROM faqs ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching FAQs:', err);
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
});


app.post('/api/faqs', async (req, res) => {
  const { question, answer } = req.body || {};

  if (!question || !answer) {
    return res.status(400).json({ error: 'question and answer are required' });
  }

  try {
    // Calculate embedding for the question
    const embedding = await calculateEmbedding(question);
    
    const { rows } = await query(
      `INSERT INTO faqs (question, answer, embedding, embedding_updated_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, question, answer, asked_count, embedding, created_at, updated_at, embedding_updated_at`,
      [question, answer, embedding]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating FAQ:', err);
    res.status(500).json({ error: 'Failed to create FAQ' });
  }
});

app.put('/api/faqs/:id', async (req, res) => {
  const { id } = req.params;
  const { question, answer } = req.body || {};

  if (!question || !answer) {
    return res.status(400).json({ error: 'question and answer are required' });
  }

  try {
    // Update FAQ without recalculating embedding (user will do it manually from debug page)
    // This marks the embedding as out of date since question/answer changed
    const { rows } = await query(
      `UPDATE faqs
       SET question = $1, answer = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, question, answer, asked_count, embedding, created_at, updated_at, embedding_updated_at`,
      [question, answer, id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'FAQ not found' });

    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating FAQ:', err);
    res.status(500).json({ error: 'Failed to update FAQ' });
  }
});


app.post('/api/faqs/:id/increment', async (req, res) => {
  const { id } = req.params;
  try {
    await query('UPDATE faqs SET asked_count = asked_count + 1 WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    console.error('Error incrementing FAQ count:', err);
    res.status(500).json({ error: 'Failed to increment FAQ count' });
  }
});

app.delete('/api/faqs/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM faqs WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    console.error('Error deleting FAQ:', err);
    res.status(500).json({ error: 'Failed to delete FAQ' });
  }
});

app.delete('/api/faqs', async (_req, res) => {
  try {
    // Use TRUNCATE with RESTART IDENTITY to reset the sequence counter
    await query('TRUNCATE TABLE faqs RESTART IDENTITY CASCADE', []);
    res.status(204).end();
  } catch (err) {
    console.error('Error deleting all FAQs:', err);
    res.status(500).json({ error: 'Failed to delete all FAQs' });
  }
});


// -----------------------------------------------------------------------------
// Media
// -----------------------------------------------------------------------------

app.get('/api/media', async (_req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, title, type, url, created_at FROM media ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching media:', err);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

app.post('/api/media', async (req, res) => {
  const { title, url, type } = req.body || {};
  if (!title || !url || !type) {
    return res
      .status(400)
      .json({ error: 'title, url and type are required' });
  }
  try {
    const { rows } = await query(
      'INSERT INTO media (title, url, type) VALUES ($1, $2, $3) RETURNING id, title, type, url, created_at',
      [title, url, type]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating media:', err);
    res.status(500).json({ error: 'Failed to create media' });
  }
});

app.put('/api/media/:id', async (req, res) => {
  const { id } = req.params;
  const { title, url, type } = req.body || {};
  if (!title || !url || !type) {
    return res
      .status(400)
      .json({ error: 'title, url and type are required' });
  }
  try {
    const { rows } = await query(
      'UPDATE media SET title = $1, url = $2, type = $3 WHERE id = $4 RETURNING id, title, type, url, created_at',
      [title, url, type, id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Media not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating media:', err);
    res.status(500).json({ error: 'Failed to update media' });
  }
});

app.delete('/api/media/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM media WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    console.error('Error deleting media:', err);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

app.delete('/api/media', async (_req, res) => {
  try {
    // Use TRUNCATE with RESTART IDENTITY to reset the sequence counter
    await query('TRUNCATE TABLE media RESTART IDENTITY CASCADE', []);
    res.status(204).end();
  } catch (err) {
    console.error('Error deleting all media:', err);
    res.status(500).json({ error: 'Failed to delete all media' });
  }
});

// -----------------------------------------------------------------------------
// Stats for dashboard
// -----------------------------------------------------------------------------

app.get('/api/stats', async (_req, res) => {
  try {
    const [messagesResult, convosResult, faqsResult, timeResult] =
      await Promise.all([
        query(
          "SELECT COUNT(*)::int AS count FROM chat_messages WHERE sender = 'user'"
        ),
        query('SELECT COUNT(*)::int AS count FROM conversations'),
        query('SELECT COUNT(*)::int AS count FROM faqs'),
        query(
          `
          SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (max_created_at - min_created_at))), 0) AS total_seconds
          FROM (
            SELECT conversation_id,
                   MIN(created_at) AS min_created_at,
                   MAX(created_at) AS max_created_at
            FROM chat_messages
            GROUP BY conversation_id
          ) t
        `
        ),
      ]);

    const totalMessages = messagesResult.rows[0]?.count ?? 0;
    const uniqueUsers = convosResult.rows[0]?.count ?? 0;
    const totalFaqs = faqsResult.rows[0]?.count ?? 0;
    const conversationTime =
      Math.round(Number(timeResult.rows[0]?.total_seconds ?? 0)) || 0;

    res.json({
      totalMessages,
      uniqueUsers,
      totalFaqs,
      conversationTime,
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// -----------------------------------------------------------------------------
// Users, conversations, messages
// -----------------------------------------------------------------------------

app.get('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await query(
      'SELECT id, name, created_at FROM users WHERE id = $1',
      [id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.post('/api/users', async (req, res) => {
  const { name } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const { rows } = await query(
      'INSERT INTO users (name) VALUES ($1) RETURNING id, name, created_at',
      [name]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.get('/api/users/:id/conversations', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await query(
      `
      SELECT id, user_id, created_at, title, is_deleted_by_user
      FROM conversations
      WHERE user_id = $1 AND (is_deleted_by_user IS NOT TRUE)
      ORDER BY created_at DESC
    `,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching conversations for user:', err);
    res
      .status(500)
      .json({ error: 'Failed to fetch conversations for user' });
  }
});

app.post('/api/conversations', async (req, res) => {
  const { userId, title } = req.body || {};
  if (!userId || !title) {
    return res.status(400).json({ error: 'userId and title are required' });
  }
  try {
    const { rows } = await query(
      `
      INSERT INTO conversations (user_id, title)
      VALUES ($1, $2)
      RETURNING id, user_id, created_at, title, is_deleted_by_user
    `,
      [userId, title]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating conversation:', err);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

app.patch('/api/conversations/:id', async (req, res) => {
  const { id } = req.params;
  const { isDeletedByUser } = req.body || {};
  try {
    await query(
      'UPDATE conversations SET is_deleted_by_user = $1 WHERE id = $2',
      [Boolean(isDeletedByUser), id]
    );
    res.status(204).end();
  } catch (err) {
    console.error('Error updating conversation:', err);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

app.get('/api/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await query(
      `
      SELECT id, conversation_id, sender, text, media_urls, created_at
      FROM chat_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
    `,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching messages for conversation:', err);
    res
      .status(500)
      .json({ error: 'Failed to fetch messages for conversation' });
  }
});

app.post('/api/messages', async (req, res) => {
  const { conversationId, sender, text, mediaUrls } = req.body || {};
  if (!conversationId || !sender || !text) {
    return res
      .status(400)
      .json({ error: 'conversationId, sender and text are required' });
  }
  try {
    const { rows } = await query(
      `
      INSERT INTO chat_messages (conversation_id, sender, text, media_urls)
      VALUES ($1, $2, $3, $4)
      RETURNING id, conversation_id, sender, text, media_urls, created_at
    `,
      [conversationId, sender, text, mediaUrls || []]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating message:', err);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

// -----------------------------------------------------------------------------
// Admin: conversations + user info for UserConversationsPage
// -----------------------------------------------------------------------------

app.get('/api/admin/conversations-with-users', async (_req, res) => {
  try {
    const { rows } = await query(
      `
      SELECT
        c.id,
        c.user_id,
        c.created_at,
        c.title,
        c.is_deleted_by_user,
        u.id   AS user_id_raw,
        u.name AS user_name,
        u.created_at AS user_created_at
      FROM conversations c
      JOIN users u ON c.user_id = u.id
      ORDER BY c.created_at DESC
    `
    );

    const mapped = rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      created_at: r.created_at,
      title: r.title,
      is_deleted_by_user: r.is_deleted_by_user,
      user: {
        id: r.user_id_raw,
        name: r.user_name,
        created_at: r.user_created_at,
      },
    }));

    res.json(mapped);
  } catch (err) {
    console.error('Error fetching admin conversations:', err);
    res
      .status(500)
      .json({ error: 'Failed to fetch admin conversations' });
  }
});

// -----------------------------------------------------------------------------
// Dangerous: reset all user data (used from DashboardPage)
// -----------------------------------------------------------------------------

app.post('/api/reset-all-user-data', async (_req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'TRUNCATE TABLE chat_messages, conversations, users RESTART IDENTITY CASCADE'
    );
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    console.error('Error resetting all user data:', err);
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Error during rollback:', rollbackErr);
    }
    res.status(500).json({ error: 'Failed to reset all user data' });
  } finally {
    client.release();
  }
});

// -----------------------------------------------------------------------------
// AUTHENTICATION MIDDLEWARE FOR DEBUG ENDPOINTS
// -----------------------------------------------------------------------------

const ADMIN_PASSWORD = process.env.VITE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

function requireAdmin(req, res, next) {
  // Check for admin password in Authorization header or x-admin-password header
  const authHeader = req.headers.authorization || req.headers['x-admin-password'];
  const providedPassword = authHeader?.replace('Bearer ', '') || authHeader;
  
  if (!ADMIN_PASSWORD) {
    console.warn('[LOG] ADMIN_PASSWORD not set. Debug endpoints are unprotected!');
    return res.status(500).json({ error: 'Server configuration error: Admin password not set' });
  }
  
  if (!providedPassword || providedPassword !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
  
  next();
}

// -----------------------------------------------------------------------------
// DEBUG ENDPOINTS
// -----------------------------------------------------------------------------

app.get('/api/debug/tables', requireAdmin, async (_req, res) => {
  try {
    const [faqs, media, users, conversations, messages, logs, reports] = await Promise.all([
      query('SELECT * FROM faqs ORDER BY id'),
      query('SELECT * FROM media ORDER BY id'),
      query('SELECT * FROM users ORDER BY created_at DESC'),
      query('SELECT * FROM conversations ORDER BY created_at DESC'),
      query('SELECT * FROM chat_messages ORDER BY created_at DESC'),
      query('SELECT * FROM debug_logs ORDER BY created_at DESC'),
      query('SELECT * FROM user_reports ORDER BY created_at DESC'),
    ]);

    res.json({
      faqs: faqs.rows || [],
      media: media.rows || [],
      users: users.rows || [],
      conversations: conversations.rows || [],
      messages: messages.rows || [],
      logs: logs.rows || [],
      reports: reports.rows || [],
    });
  } catch (err) {
    console.error('Error fetching debug tables:', err);
    res.status(500).json({ error: 'Failed to fetch table data', details: err.message });
  }
});

app.post('/api/debug/refresh-embeddings', requireAdmin, async (req, res) => {
  const { faqId } = req.body || {};

  try {
    let faqsToUpdate;
    if (faqId === null || faqId === undefined) {
      // Refresh all FAQs
      const result = await query('SELECT id, question FROM faqs');
      faqsToUpdate = result.rows || [];
    } else {
      // Refresh specific FAQ
      const result = await query('SELECT id, question FROM faqs WHERE id = $1', [faqId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'FAQ not found' });
      }
      faqsToUpdate = result.rows;
    }

    let successCount = 0;
    for (const faq of faqsToUpdate) {
      try {
        const embedding = await calculateEmbedding(faq.question);
        await query(
          'UPDATE faqs SET embedding = $1, embedding_updated_at = NOW() WHERE id = $2',
          [embedding, faq.id]
        );
        successCount++;
      } catch (err) {
        console.error(`Error refreshing embedding for FAQ ${faq.id}:`, err);
      }
    }

    res.json({
      success: true,
      count: successCount,
      total: faqsToUpdate.length,
    });
  } catch (err) {
    console.error('Error refreshing embeddings:', err);
    res.status(500).json({ error: 'Failed to refresh embeddings' });
  }
});

app.delete('/api/debug/delete-row', requireAdmin, async (req, res) => {
  const { table, idColumn, id } = req.body || {};

  if (!table || !idColumn || id === undefined || id === null) {
    return res.status(400).json({ error: 'table, idColumn, and id are required' });
  }

  // Map table names to actual database table names
  const tableMap = {
    faqs: 'faqs',
    media: 'media',
    users: 'users',
    conversations: 'conversations',
    messages: 'chat_messages',
    logs: 'debug_logs',
    reports: 'user_reports',
  };

  const dbTableName = tableMap[table];
  if (!dbTableName) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  try {
    // Use parameterized query to prevent SQL injection
    const result = await query(
      `DELETE FROM ${dbTableName} WHERE ${idColumn} = $1 RETURNING ${idColumn}`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Row not found' });
    }

    res.json({ success: true, deletedId: result.rows[0][idColumn] });
  } catch (err) {
    console.error('Error deleting row:', err);
    res.status(500).json({ error: 'Failed to delete row', details: err.message });
  }
});

app.post('/api/debug/copy-row', requireAdmin, async (req, res) => {
  const { table, idColumn, id } = req.body || {};

  if (!table || !idColumn || id === undefined || id === null) {
    return res.status(400).json({ error: 'table, idColumn, and id are required' });
  }

  // Map table names to actual database table names
  const tableMap = {
    faqs: 'faqs',
    media: 'media',
    users: 'users',
    conversations: 'conversations',
    messages: 'chat_messages',
    logs: 'debug_logs',
    reports: 'user_reports',
  };

  const dbTableName = tableMap[table];
  if (!dbTableName) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  try {
    // Get the row to copy
    const selectResult = await query(
      `SELECT * FROM ${dbTableName} WHERE ${idColumn} = $1`,
      [id]
    );

    if (selectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Row not found' });
    }

    const row = selectResult.rows[0];
    // Get all columns except id and created_at
    let columns = Object.keys(row).filter(col => col !== idColumn && col !== 'created_at');
    const values = [];

    // Build values array, handling FAQs specially
    if (table === 'faqs' && row.question) {
      // For FAQs, recalculate embedding instead of copying old one
      for (const col of columns) {
        if (col === 'embedding') {
          // Recalculate embedding for the question
          const embedding = await calculateEmbedding(row.question);
          values.push(embedding);
        } else {
          values.push(row[col]);
        }
      }
    } else {
      // For other tables, just copy all values
      for (const col of columns) {
        values.push(row[col]);
      }
    }

    const placeholders = values.map((_, i) => `$${i + 1}`);

    // Insert the copied row (without id and created_at, they'll be auto-generated)
    const insertResult = await query(
      `INSERT INTO ${dbTableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      values
    );

    res.json({ success: true, newRow: insertResult.rows[0] });
  } catch (err) {
    console.error('Error copying row:', err);
    res.status(500).json({ error: 'Failed to copy row', details: err.message });
  }
});

app.post('/api/debug/update-cell', requireAdmin, async (req, res) => {
  const { table, idColumn, id, column, value } = req.body || {};

  if (!table || !idColumn || id === undefined || id === null || !column || value === undefined) {
    return res.status(400).json({ error: 'table, idColumn, id, column, and value are required' });
  }

  // Map table names to actual database table names
  const tableMap = {
    faqs: 'faqs',
    media: 'media',
    users: 'users',
    conversations: 'conversations',
    messages: 'chat_messages',
    logs: 'debug_logs',
    reports: 'user_reports',
  };

  const dbTableName = tableMap[table];
  if (!dbTableName) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  // Prevent editing of protected columns
  const protectedColumns = ['created_at', 'embedding'];
  if (protectedColumns.includes(column.toLowerCase())) {
    return res.status(400).json({ error: `Cannot edit protected column: ${column}` });
  }

  try {
    // Validate column name to prevent SQL injection
    const validColumnName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column);
    if (!validColumnName) {
      return res.status(400).json({ error: 'Invalid column name' });
    }

    // For FAQs, if updating question or answer, update updated_at but NOT embedding_updated_at
    // This marks the embedding as out of date (since the question/answer changed but embedding wasn't recalculated)
    if (dbTableName === 'faqs' && (column === 'question' || column === 'answer')) {
      await query(
        `UPDATE ${dbTableName} SET ${column} = $1, updated_at = NOW() WHERE ${idColumn} = $2`,
        [value, id]
      );
    } else {
      // Regular update (no embedding recalculation in debug page)
      await query(
        `UPDATE ${dbTableName} SET ${column} = $1 WHERE ${idColumn} = $2`,
        [value, id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating cell:', err);
    res.status(500).json({ error: 'Failed to update cell', details: err.message });
  }
});

app.post('/api/debug/delete-column', requireAdmin, async (req, res) => {
  // Try to get from body first, then from query params as fallback
  const { table, column } = req.body || req.query || {};

  if (!table || !column) {
    return res.status(400).json({ error: 'table and column are required' });
  }

  // Map table names to actual database table names
  const tableMap = {
    faqs: 'faqs',
    media: 'media',
    users: 'users',
    conversations: 'conversations',
    messages: 'chat_messages',
    logs: 'debug_logs',
    reports: 'user_reports',
  };

  const dbTableName = tableMap[table];
  if (!dbTableName) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  // Prevent deletion of critical columns
  const protectedColumns = ['id'];
  if (protectedColumns.includes(column.toLowerCase())) {
    return res.status(400).json({ error: `Cannot delete protected column: ${column}` });
  }

  try {
    // Use parameterized query - but column names can't be parameterized in DDL
    // So we need to validate the column name to prevent SQL injection
    const validColumnName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column);
    if (!validColumnName) {
      return res.status(400).json({ error: 'Invalid column name' });
    }

    // Execute ALTER TABLE DROP COLUMN
    await query(
      `ALTER TABLE ${dbTableName} DROP COLUMN IF EXISTS ${column}`,
      []
    );

    res.json({ success: true, table: dbTableName, column });
  } catch (err) {
    console.error('Error deleting column:', err);
    res.status(500).json({ error: 'Failed to delete column', details: err.message });
  }
});

// Reset sequence for a table
app.post('/api/debug/reset-sequence', requireAdmin, async (req, res) => {
  const { table } = req.body || {};

  if (!table) {
    return res.status(400).json({ error: 'table is required' });
  }

  // Map table names to actual database table names and their sequence names
  const tableMap = {
    faqs: { table: 'faqs', sequence: 'faqs_id_seq' },
    media: { table: 'media', sequence: 'media_id_seq' },
    conversations: { table: 'conversations', sequence: 'conversations_id_seq' },
    messages: { table: 'chat_messages', sequence: 'chat_messages_id_seq' },
  };

  const tableInfo = tableMap[table];
  if (!tableInfo) {
    return res.status(400).json({ error: 'Invalid table name or table does not use sequences' });
  }

  try {
    // Get the maximum ID from the table
    const maxResult = await query(
      `SELECT COALESCE(MAX(id), 0) as max_id FROM ${tableInfo.table}`,
      []
    );
    const maxId = parseInt(maxResult.rows[0].max_id) || 0;

    // Reset the sequence to start from maxId + 1
    await query(
      `SELECT setval('${tableInfo.sequence}', ${maxId + 1}, false)`,
      []
    );

    res.json({ success: true, table: tableInfo.table, nextId: maxId + 1 });
  } catch (err) {
    console.error('Error resetting sequence:', err);
    res.status(500).json({ error: 'Failed to reset sequence', details: err.message });
  }
});

// Get database relationships (foreign keys)
app.get('/api/debug/relationships', requireAdmin, async (_req, res) => {
  try {
    const result = await query(
      `SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name;`,
      []
    );

    res.json({ success: true, relationships: result.rows });
  } catch (err) {
    console.error('Error fetching relationships:', err);
    res.status(500).json({ error: 'Failed to fetch relationships', details: err.message });
  }
});

// Run custom SQL query
app.post('/api/debug/run-query', requireAdmin, async (req, res) => {
  const { query: sqlQuery, params = [] } = req.body || {};

  if (!sqlQuery || typeof sqlQuery !== 'string') {
    return res.status(400).json({ error: 'query is required and must be a string' });
  }

  // Prevent dangerous operations
  const dangerousKeywords = ['DROP', 'TRUNCATE', 'DELETE', 'ALTER', 'CREATE', 'GRANT', 'REVOKE'];
  const upperQuery = sqlQuery.toUpperCase().trim();
  
  // Allow DELETE only if it's part of a DELETE FROM ... WHERE pattern (controlled delete)
  // But block DROP, TRUNCATE, ALTER, CREATE, GRANT, REVOKE
  const blockedKeywords = ['DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'GRANT', 'REVOKE'];
  const isBlocked = blockedKeywords.some(keyword => upperQuery.startsWith(keyword));
  
  if (isBlocked) {
    return res.status(400).json({ 
      error: `Blocked operation: ${blockedKeywords.find(k => upperQuery.startsWith(k))}. Only SELECT, INSERT, UPDATE, and controlled DELETE are allowed.` 
    });
  }

  try {
    // Validate params is an array
    if (!Array.isArray(params)) {
      return res.status(400).json({ error: 'params must be an array' });
    }

    const result = await query(sqlQuery, params);
    
    res.json({ 
      success: true, 
      rows: result.rows,
      rowCount: result.rowCount || result.rows.length,
      columns: result.rows.length > 0 ? Object.keys(result.rows[0]) : []
    });
  } catch (err) {
    console.error('Error running query:', err);
    res.status(500).json({ error: 'Failed to run query', details: err.message });
  }
});

// Store log in database
async function storeLog(message, userId = null, queryId = null) {
  try {
    // Check if table exists first
    const tableCheck = await query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'debug_logs'
      );`,
      []
    );
    
    if (!tableCheck.rows[0]?.exists) {
      // Table doesn't exist yet, skip logging
      return;
    }

    await query(
      `INSERT INTO debug_logs (user_id, query_id, message)
       VALUES ($1, $2, $3)`,
      [userId, queryId, message]
    );
  } catch (err) {
    // Don't fail if logging fails, silently ignore
    // Only log if it's not a "table doesn't exist" error
    if (err.code !== '42P01') {
      console.error('Failed to store log:', err);
    }
  }
}

// Intercept console.log, console.error, etc. to capture logs
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

function addLog(level, ...args) {
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  // Store in database (async, don't wait) - no query_id for server logs
  storeLog(message, null, null);

  // Also call original console method
  if (level === 'log') originalConsoleLog(...args);
  else if (level === 'error') originalConsoleError(...args);
  else if (level === 'warn') originalConsoleWarn(...args);
  else if (level === 'info') originalConsoleInfo(...args);
}

// Override console methods (only in development/debug mode)
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG_LOGS === 'true') {
  console.log = (...args) => addLog('log', ...args);
  console.error = (...args) => addLog('error', ...args);
  console.warn = (...args) => addLog('warn', ...args);
  console.info = (...args) => addLog('info', ...args);
}

// API endpoint to receive logs from client
app.post('/api/debug/log', async (req, res) => {
  const { message, userId, queryId } = req.body || {};
  
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    await storeLog(message, userId || null, queryId || null);
    res.json({ success: true });
  } catch (err) {
    console.error('Error storing log:', err);
    res.status(500).json({ error: 'Failed to store log', details: err.message });
  }
});

// Get debug logs from database
app.get('/api/debug/logs', requireAdmin, async (req, res) => {
  const { limit = 500, since, userId, queryId } = req.query || {};
  
  try {
    let queryText = 'SELECT id, user_id, query_id, message, created_at FROM debug_logs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Filter by user
    if (userId) {
      queryText += ` AND user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    // Filter by queryId
    if (queryId) {
      queryText += ` AND query_id = $${paramIndex}`;
      params.push(queryId);
      paramIndex++;
    }

    // Filter by timestamp
    if (since) {
      queryText += ` AND created_at >= $${paramIndex}`;
      params.push(since);
      paramIndex++;
    }

    // Order by created_at DESC and limit
    queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    const limitNum = parseInt(limit) || 500;
    params.push(limitNum);

    const result = await query(queryText, params);
    
    // Get total count
    const countResult = await query('SELECT COUNT(*) as total FROM debug_logs', []);
    const total = parseInt(countResult.rows[0].total) || 0;

    const logs = result.rows.map(row => ({
      id: row.id,
      timestamp: row.created_at,
      message: row.message,
      userId: row.user_id,
      queryId: row.query_id,
    }));

    res.json({ success: true, logs, total });
  } catch (err) {
    console.error('Error fetching logs:', err);
    res.status(500).json({ error: 'Failed to fetch logs', details: err.message });
  }
});

// Clear debug logs
app.post('/api/debug/clear-logs', requireAdmin, async (req, res) => {
  const { userId } = req.body || {};
  
  try {
    if (userId) {
      // Get query_ids from logs to be deleted
      const logResult = await query('SELECT DISTINCT query_id FROM debug_logs WHERE user_id = $1 AND query_id IS NOT NULL', [userId]);
      const queryIds = logResult.rows.map(row => row.query_id);
      
      // Delete reports with matching query_ids
      if (queryIds.length > 0) {
        await query('DELETE FROM user_reports WHERE query_id = ANY($1::text[])', [queryIds]);
      }
      
      // Delete logs
      await query('DELETE FROM debug_logs WHERE user_id = $1', [userId]);
      res.json({ success: true, message: `Logs cleared for user ${userId}` });
    } else {
      // Delete all reports (since all logs are being deleted)
      await query('TRUNCATE TABLE user_reports RESTART IDENTITY', []);
      await query('TRUNCATE TABLE debug_logs RESTART IDENTITY', []);
      res.json({ success: true, message: 'All logs and reports cleared' });
    }
  } catch (err) {
    console.error('Error clearing logs:', err);
    res.status(500).json({ error: 'Failed to clear logs', details: err.message });
  }
});

// ========== USER REPORTS ENDPOINTS ==========

// Create a user report
app.post('/api/reports', async (req, res) => {
  const { userId, queryId, reportType } = req.body || {};
  
  if (!reportType || !reportType.trim()) {
    return res.status(400).json({ error: 'Report type is required' });
  }

  // Use the provided queryId, or null if not provided
  // Don't generate a fake queryId - reports without queryId just won't link to logs
  const finalQueryId = queryId || null;

  try {
    const result = await query(
      `INSERT INTO user_reports (user_id, query_id, report_type)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId || null, finalQueryId, reportType]
    );

    res.json({ success: true, report: result.rows[0] });
  } catch (err) {
    console.error('Error creating report:', err);
    res.status(500).json({ error: 'Failed to create report', details: err.message });
  }
});

// Get all reports
app.get('/api/reports', requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, u.name as user_name
       FROM user_reports r
       LEFT JOIN users u ON r.user_id = u.id
       ORDER BY r.created_at DESC
       LIMIT 500`,
      []
    );

    // For each report, get the bot response from logs
    const reportsWithBotResponse = await Promise.all(
      result.rows.map(async (report) => {
        if (report.query_id) {
          const logResult = await query(
            `SELECT message FROM debug_logs 
             WHERE query_id = $1 AND message LIKE '✅ Final response generated:%'
             ORDER BY created_at DESC LIMIT 1`,
            [report.query_id]
          );
          if (logResult.rows.length > 0) {
            const message = logResult.rows[0].message;
            // Extract bot response from "✅ Final response generated: {response}"
            const botResponse = message.replace('✅ Final response generated: ', '');
            return { ...report, bot_response: botResponse };
          }
        }
        return report;
      })
    );

    res.json({ success: true, reports: reportsWithBotResponse });
  } catch (err) {
    console.error('Error fetching reports:', err);
    res.status(500).json({ error: 'Failed to fetch reports', details: err.message });
  }
});

// Update report status
app.put('/api/reports/:id/status', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  
  if (!status || !['active', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'Valid status (active, resolved) is required' });
  }

  try {
    const result = await query(
      `UPDATE user_reports SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ success: true, report: result.rows[0] });
  } catch (err) {
    console.error('Error updating report status:', err);
    res.status(500).json({ error: 'Failed to update report status', details: err.message });
  }
});

// Delete a single report
app.delete('/api/reports/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await query('DELETE FROM user_reports WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ success: true, message: 'Report deleted' });
  } catch (err) {
    console.error('Error deleting report:', err);
    res.status(500).json({ error: 'Failed to delete report', details: err.message });
  }
});

// Clear all reports
app.delete('/api/reports', requireAdmin, async (req, res) => {
  try {
    await query('TRUNCATE TABLE user_reports RESTART IDENTITY', []);
    res.json({ success: true, message: 'All reports cleared' });
  } catch (err) {
    console.error('Error clearing reports:', err);
    res.status(500).json({ error: 'Failed to clear reports', details: err.message });
  }
});

// ========== REPORT CATEGORIES ENDPOINTS ==========

// Get all report categories
app.get('/api/debug/report-categories', requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT name, display_order FROM report_categories ORDER BY display_order, name`,
      []
    );

    res.json({ success: true, categories: result.rows.map(r => ({ name: r.name, order: r.display_order })) });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Failed to fetch categories', details: err.message });
  }
});

// Add a new report category
app.post('/api/debug/report-categories', requireAdmin, async (req, res) => {
  const { name } = req.body || {};
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  const categoryName = name.trim().toLowerCase().replace(/\s+/g, '_');

  try {
    // Get the max order and add 1 for the new category
    const maxOrderResult = await query(
      `SELECT COALESCE(MAX(display_order), -1) + 1 as next_order FROM report_categories`,
      []
    );
    const nextOrder = maxOrderResult.rows[0].next_order;

    const result = await query(
      `INSERT INTO report_categories (name, display_order) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING RETURNING *`,
      [categoryName, nextOrder]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    res.json({ success: true, category: result.rows[0] });
  } catch (err) {
    console.error('Error creating category:', err);
    res.status(500).json({ error: 'Failed to create category', details: err.message });
  }
});

// Delete a report category
app.delete('/api/debug/report-categories', requireAdmin, async (req, res) => {
  const { name } = req.body || {};
  
  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  try {
    const result = await query(
      `DELETE FROM report_categories WHERE name = $1 RETURNING *`,
      [name]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ error: 'Failed to delete category', details: err.message });
  }
});

// Reorder report categories
app.post('/api/debug/report-categories/reorder', requireAdmin, async (req, res) => {
  const { name, sourceIndex, targetIndex, sourceOrder, targetOrder } = req.body || {};
  
  if (name === undefined || sourceIndex === undefined || targetIndex === undefined) {
    return res.status(400).json({ error: 'Category name, sourceIndex, and targetIndex are required' });
  }

  if (sourceIndex === targetIndex) {
    return res.json({ success: true, message: 'No change needed' });
  }

  try {
    // Get all categories ordered by display_order
    const allCategories = await query(
      `SELECT name, display_order FROM report_categories ORDER BY display_order`,
      []
    );

    if (sourceIndex < 0 || sourceIndex >= allCategories.rows.length || 
        targetIndex < 0 || targetIndex >= allCategories.rows.length) {
      return res.status(400).json({ error: 'Invalid index' });
    }

    // Reorder the array
    const reordered = [...allCategories.rows];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    // Update all orders in a transaction
    await query('BEGIN', []);
    try {
      for (let i = 0; i < reordered.length; i++) {
        await query(
          `UPDATE report_categories SET display_order = $1 WHERE name = $2`,
          [i, reordered[i].name]
        );
      }
      await query('COMMIT', []);
    } catch (err) {
      await query('ROLLBACK', []);
      throw err;
    }

    res.json({ success: true, message: 'Category reordered' });
  } catch (err) {
    console.error('Error reordering category:', err);
    res.status(500).json({ error: 'Failed to reorder category', details: err.message });
  }
});

// ========== SERVE FRONTEND BUILD ON RENDER ==========
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve the built Vite frontend from /dist
app.use(express.static(path.join(__dirname, "..", "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "dist", "index.html"));
});

(async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.error('[ERROR] Failed to initialise database schema:', err);
  }

  app.listen(PORT, () => {
    console.log(`[LOG] API server listening on http://localhost:${PORT}`);
  });
})();

