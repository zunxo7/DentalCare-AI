-- Enable caching in dashboard by default
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('cache_enabled', 'true');

-- Add caching columns to chat_messages
-- Check if columns exist before adding (SQLite doesn't support IF NOT EXISTS for columns, just running these might fail if they exist, which is fine)
ALTER TABLE chat_messages ADD COLUMN canonical_intent TEXT;
ALTER TABLE chat_messages ADD COLUMN route TEXT;
ALTER TABLE chat_messages ADD COLUMN resolved_faq_id INTEGER;
ALTER TABLE chat_messages ADD COLUMN pipeline_version INTEGER;
