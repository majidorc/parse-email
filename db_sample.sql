-- Complete Database Schema for Bookings Management & Notification Dashboard
-- Run this in your Neon/PostgreSQL database to set up all required tables

-- SETTINGS TABLE
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  notification_email_to TEXT,
  google_analytics_id TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- USER WHITELIST TABLE
CREATE TABLE IF NOT EXISTS user_whitelist (
  email TEXT PRIMARY KEY,
  phone_number TEXT,
  telegram_user_id TEXT,
  role TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

-- BOOKINGS TABLE
CREATE TABLE IF NOT EXISTS bookings (
  booking_number TEXT PRIMARY KEY,
  order_number TEXT, -- NEW: To link multiple bookings from same order
  book_date DATE,
  tour_date DATE,
  sku TEXT,
  program TEXT,
  rate TEXT,
  addons JSONB, -- NEW: Store addons as JSON array
  hotel TEXT,
  phone_number TEXT,
  customer_name TEXT,
  adult INTEGER DEFAULT 0,
  child INTEGER DEFAULT 0,
  infant INTEGER DEFAULT 0,
  paid NUMERIC(12,2),
  net_total NUMERIC(12,2),
  raw_tour_date TEXT,
  national_park_fee BOOLEAN DEFAULT FALSE,
  no_transfer BOOLEAN DEFAULT FALSE,
  op BOOLEAN DEFAULT FALSE,
  ri BOOLEAN DEFAULT FALSE,
  customer BOOLEAN DEFAULT FALSE,
  notification_sent BOOLEAN DEFAULT FALSE,
  channel TEXT,
  updated_fields JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku TEXT,
  product_id_optional TEXT,
  program TEXT,
  remark TEXT
);

-- RATES TABLE
CREATE TABLE IF NOT EXISTS rates (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  net_adult NUMERIC(12,2) NOT NULL,
  net_child NUMERIC(12,2) NOT NULL,
  fee_type TEXT NOT NULL,
  fee_adult NUMERIC(12,2),
  fee_child NUMERIC(12,2)
);

-- PARSED EMAILS TABLE
CREATE TABLE IF NOT EXISTS parsed_emails (
  booking_number TEXT PRIMARY KEY,
  sender TEXT,
  subject TEXT,
  body TEXT,
  source_email TEXT,
  parsed_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookings_tour_date ON bookings(tour_date);
CREATE INDEX IF NOT EXISTS idx_bookings_book_date ON bookings(book_date);
CREATE INDEX IF NOT EXISTS idx_bookings_program ON bookings(program);
CREATE INDEX IF NOT EXISTS idx_bookings_sku ON bookings(sku);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_name ON bookings(customer_name);
CREATE INDEX IF NOT EXISTS idx_bookings_hotel ON bookings(hotel);
CREATE INDEX IF NOT EXISTS idx_bookings_no_transfer ON bookings(no_transfer);
CREATE INDEX IF NOT EXISTS idx_bookings_order_number ON bookings(order_number); -- NEW: Index for order_number
CREATE INDEX IF NOT EXISTS idx_rates_product_id ON rates(product_id);
CREATE INDEX IF NOT EXISTS idx_user_whitelist_role ON user_whitelist(role);
CREATE INDEX IF NOT EXISTS idx_user_whitelist_email ON user_whitelist(email);
CREATE INDEX IF NOT EXISTS idx_parsed_emails_sender ON parsed_emails(sender);
CREATE INDEX IF NOT EXISTS idx_parsed_emails_source_email ON parsed_emails(source_email);

-- Sample admin user for whitelist (replace with your email)
INSERT INTO user_whitelist (email, role, is_active) 
VALUES ('admin@example.com', 'admin', TRUE)
ON CONFLICT (email) DO NOTHING;

-- Sample settings record (optional)
INSERT INTO settings (id, telegram_bot_token, telegram_chat_id, notification_email_to, google_analytics_id, updated_at)
VALUES (1, '', '', '', '', NOW())
ON CONFLICT (id) DO NOTHING; 