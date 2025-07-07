const { sql } = require('@vercel/postgres');
const NotificationManager = require('../notificationManager');
const axios = require('axios');

// Helper to send a message back to Telegram
async function sendTelegram(chat_id, text) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id,
    text,
    parse_mode: 'Markdown'
  });
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
  return [];
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const message = body.message;
    if (!message || !message.text) return res.json({ ok: true });
    const chat_id = message.chat.id;
    const query = message.text.trim();
    if (!query) {
      await sendTelegram(chat_id, 'Please send a booking number, customer name, or date (YYYY-MM-DD) to search.');
      return res.json({ ok: true });
    }
    const results = await searchBookings(query);
    if (results.length === 0) {
      await sendTelegram(chat_id, 'No bookings found for your query.');
      return res.json({ ok: true });
    }
    const nm = new NotificationManager();
    for (const booking of results) {
      const text = nm.constructNotificationMessage(booking);
      await sendTelegram(chat_id, text);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('Telegram bot error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}; 