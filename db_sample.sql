CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  notification_email_to TEXT,
  google_analytics_id TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
); 