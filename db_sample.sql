CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY,
  bokun_access_key TEXT,
  bokun_secret_key TEXT,
  woocommerce_consumer_key TEXT,
  woocommerce_consumer_secret TEXT,
  use_bokun_api BOOLEAN DEFAULT FALSE,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  notification_email_to TEXT,
  google_analytics_id TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
); 