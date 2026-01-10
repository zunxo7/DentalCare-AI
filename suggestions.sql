-- Create Suggestion Chips table
CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    english_text TEXT NOT NULL,
    urdu_text TEXT,
    roman_text TEXT,
    linked_faq_id INTEGER REFERENCES faqs(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
