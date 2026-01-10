-- Create Suggestion Chips table
DROP TABLE IF EXISTS suggestions;

CREATE TABLE suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keywords TEXT NOT NULL, -- Comma-separated keywords (e.g. "brush, cleaning")
  chips_json TEXT NOT NULL, -- JSON array of chips: [{ text_en, text_ur, text_roman, linked_faq_id }]
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
