const { sql } = require('@vercel/postgres');
const NotificationManager = require('../notificationManager');
const axios = require('axios');
const moment = require('moment');

// Helper to send a message back to Telegram
async function sendTelegram(chat_id, text, reply_to_message_id = null) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id,
    text,
    parse_mode: 'Markdown'
  };
  if (reply_to_message_id) payload.reply_to_message_id = reply_to_message_id;
  await axios.post(url, payload);
}

// Helper to search bookings
async function searchBookings(query) {
  // Try booking number (exact)
  let sqlQuery = 'SELECT * FROM bookings WHERE booking_number = $1';
  let params = [query];
  let { rows } = await sql.query(sqlQuery, params);
  if (rows.length > 0) return rows;
  // Try customer name (partial, case-insensitive)
  sqlQuery = 'SELECT * FROM bookings WHERE customer_name ILIKE $1 ORDER BY tour_date DESC LIMIT 3';
  params = [`%${query}%`];
  rows = (await sql.query(sqlQuery, params)).rows;
  if (rows.length > 0) return rows;
  // Try date (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(query)) {
    sqlQuery = 'SELECT * FROM bookings WHERE tour_date::date = $1 ORDER BY tour_date DESC LIMIT 3';
    params = [query];
    rows = (await sql.query(sqlQuery, params)).rows;
    if (rows.length > 0) return rows;
  }
  // Try date in 'D MMM YY' or 'DD MMM YY' format (e.g., '17 May 25')
  const parsed = moment(query, ['D MMM YY', 'DD MMM YY', 'D MMMM YY', 'DD MMMM YY'], true);
  if (parsed.isValid()) {
    const dateStr = parsed.format('YYYY-MM-DD');
    sqlQuery = 'SELECT * FROM bookings WHERE tour_date::date = $1 ORDER BY tour_date DESC LIMIT 3';
    params = [dateStr];
    rows = (await sql.query(sqlQuery, params)).rows;
    if (rows.length > 0) return rows;
  }
  return [];
}

// Extract search query from message text
function extractQuery(text, botUsername) {
  if (!text) return '';
  text = text.trim();
  // Handle /search command
  if (text.startsWith('/search')) {
    return text.replace(/^\/search(@\w+)?\s*/i, '');
  }
  // Handle mention (e.g., @botname query)
  if (text.startsWith('@')) {
    // Remove @botname and any whitespace
    return text.replace(/^@\w+\s*/i, '');
  }
  // Otherwise, return as is
  return text;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const message = body.message;
    if (!message || !message.text) return res.json({ ok: true });
    const chat_id = message.chat.id;
    const reply_to_message_id = message.message_id;
    // Try to get bot username from environment (optional, fallback to generic)
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || '';
    const text = message.text.trim();
    const query = extractQuery(text, botUsername);
    if (!query) {
      await sendTelegram(chat_id, 'Please send /search <booking number>, customer name, or date (YYYY-MM-DD) to search.', reply_to_message_id);
      return res.json({ ok: true });
    }
    const results = await searchBookings(query);
    if (results.length === 0) {
      await sendTelegram(chat_id, 'No bookings found for your query.', reply_to_message_id);
      return res.json({ ok: true });
    }
    const nm = new NotificationManager();
    for (const booking of results) {
      const text = nm.constructNotificationMessage(booking);
      await sendTelegram(chat_id, text, reply_to_message_id);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('Telegram bot error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}; 