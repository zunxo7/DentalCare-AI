import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pkg from 'pg';

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
  console.log('[server] Ensuring database schema exists...');

  // Enable functions for UUIDs if available (safe to run repeatedly)
  await query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";', []).catch(() => {});

  // FAQs table
  await query(
    `CREATE TABLE IF NOT EXISTS faqs (
      id          SERIAL PRIMARY KEY,
      question    TEXT NOT NULL,
      answer      TEXT NOT NULL,
      asked_count INTEGER NOT NULL DEFAULT 0,
      keywords    TEXT[] NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    []
  );

  // Force-add keywords column if table already existed before
  await query(
    `ALTER TABLE faqs 
        ADD COLUMN IF NOT EXISTS keywords TEXT[] NOT NULL DEFAULT '{}';`,
    []
  );

  // MEDIA table
  await query(
    `CREATE TABLE IF NOT EXISTS media (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL,
      type       TEXT NOT NULL CHECK (type IN ('video', 'image', 'document')),
      url        TEXT NOT NULL,
      keywords   TEXT[] NOT NULL DEFAULT '{}',
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

  console.log('[server] Database schema ready.');
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
      'SELECT id, question, answer, asked_count, keywords, created_at FROM faqs ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching FAQs:', err);
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
});


app.post('/api/faqs', async (req, res) => {
  const { question, answer, keywords } = req.body || {};

  if (!question || !answer) {
    return res.status(400).json({ error: 'question and answer are required' });
  }

  try {
    const { rows } = await query(
      `INSERT INTO faqs (question, answer, keywords)
       VALUES ($1, $2, $3)
       RETURNING id, question, answer, keywords, asked_count, created_at`,
      [question, answer, keywords || []]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating FAQ:', err);
    res.status(500).json({ error: 'Failed to create FAQ' });
  }
});

app.put('/api/faqs/:id', async (req, res) => {
  const { id } = req.params;
  const { question, answer, keywords } = req.body || {};

  if (!question || !answer) {
    return res.status(400).json({ error: 'question and answer are required' });
  }

  try {
    const { rows } = await query(
      `UPDATE faqs
       SET question = $1, answer = $2, keywords = $3
       WHERE id = $4
       RETURNING id, question, answer, keywords, asked_count, created_at`,
      [question, answer, keywords || [], id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'FAQ not found' });

    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating FAQ:', err);
    res.status(500).json({ error: 'Failed to update FAQ' });
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
    await query('DELETE FROM faqs', []);
    res.status(204).end();
  } catch (err) {
    console.error('Error deleting all FAQs:', err);
    res.status(500).json({ error: 'Failed to delete all FAQs' });
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

// -----------------------------------------------------------------------------
// Media
// -----------------------------------------------------------------------------

app.get('/api/media', async (_req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, title, type, url, keywords, created_at FROM media ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching media:', err);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

app.post('/api/media', async (req, res) => {
  const { title, url, type, keywords } = req.body || {};
  if (!title || !url || !type) {
    return res
      .status(400)
      .json({ error: 'title, url and type are required' });
  }
  try {
    const { rows } = await query(
      'INSERT INTO media (title, url, type, keywords) VALUES ($1, $2, $3, $4) RETURNING id, title, type, url, keywords, created_at',
      [title, url, type, keywords || []]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating media:', err);
    res.status(500).json({ error: 'Failed to create media' });
  }
});

app.put('/api/media/:id', async (req, res) => {
  const { id } = req.params;
  const { title, url, type, keywords } = req.body || {};
  if (!title || !url || !type) {
    return res
      .status(400)
      .json({ error: 'title, url and type are required' });
  }
  try {
    const { rows } = await query(
      'UPDATE media SET title = $1, url = $2, type = $3, keywords = $4 WHERE id = $5 RETURNING id, title, type, url, keywords, created_at',
      [title, url, type, keywords || [], id]
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
    await query('DELETE FROM media', []);
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
    await client.query('UPDATE faqs SET asked_count = 0');
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
// ========== SERVE FRONTEND BUILD ON RENDER ==========
import path from "path";
import { fileURLToPath } from "url";

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
    console.error('[server] Failed to initialise database schema:', err);
  }

  app.listen(PORT, () => {
    console.log(`API server listening on http://localhost:${PORT}`);
  });
})();
