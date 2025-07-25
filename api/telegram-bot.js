const { sql } = require('@vercel/postgres');
const NotificationManager = require('../notificationManager');
const axios = require('axios');
const moment = require('moment');

// Helper to get Telegram Bot Token from settings
async function getTelegramBotToken() {
  const { rows } = await sql`SELECT telegram_bot_token FROM settings ORDER BY updated_at DESC LIMIT 1;`;
  return rows[0]?.telegram_bot_token || '';
}

// Helper to get Telegram Chat ID from settings
async function getTelegramChatId() {
  const { rows } = await sql`SELECT telegram_chat_id FROM settings ORDER BY updated_at DESC LIMIT 1;`;
  return rows[0]?.telegram_chat_id || '';
}

// Helper to send a message back to Telegram
async function sendTelegram(chat_id, text, reply_to_message_id = null) {
  try {
  const token = await getTelegramBotToken();
    if (!token) {
      console.error('No Telegram bot token found');
      return;
    }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const chatId = chat_id || await getTelegramChatId();
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown'
  };
  if (reply_to_message_id) payload.reply_to_message_id = reply_to_message_id;
    console.log('Sending Telegram message:', { chat_id: chatId, text: text.substring(0, 50) + '...' });
    const response = await axios.post(url, payload);
    console.log('Telegram response:', response.status);
  } catch (error) {
    console.error('Error sending Telegram message:', error.message);
    if (error.response) {
      console.error('Telegram API error:', error.response.data);
    }
  }
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
  // For any other text, treat it as a search query
  return text;
}

module.exports = async (req, res) => {
  // Add a simple test endpoint
  if (req.method === 'GET') {
    return res.json({ 
      ok: true, 
      message: 'Telegram bot endpoint is working',
      timestamp: new Date().toISOString()
    });
  }
  
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  try {
    console.log('Telegram bot received request:', req.body);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const message = body.message;
    if (!message || !message.text) {
      console.log('No message or text found');
      return res.json({ ok: true });
    }
    const chat_id = message.chat.id;
    const reply_to_message_id = message.message_id;
    console.log('Processing message:', message.text, 'from chat:', chat_id);
    
    // TEST: Send a simple response to verify the bot is working
    // await sendTelegram(chat_id, '🤖 Bot received your message: ' + message.text, reply_to_message_id);
    // (Remove this test line, keep only booking search logic)
    
    // Get sender's phone number via Telegram (if available)
    const from = message.from || {};
    const telegramUserId = from.id;
    if (!telegramUserId) {
      console.log('No telegram user ID found');
      await sendTelegram(chat_id, 'Access denied. Telegram user ID not found.', reply_to_message_id);
      return res.json({ ok: true });
    }
    console.log('Telegram user ID:', telegramUserId);
    
    // Check whitelist by telegram_user_id
    const { rows } = await sql`SELECT is_active FROM user_whitelist WHERE telegram_user_id = ${telegramUserId}`;
    if (!rows.length || !rows[0].is_active) {
      console.log('User not whitelisted or inactive');
      await sendTelegram(chat_id, 'You are not authorized to use this bot. Please contact the admin to be whitelisted.', reply_to_message_id);
      return res.json({ ok: true });
    }
    console.log('User is whitelisted');
    
    // Try to get bot username from environment (optional, fallback to generic)
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || '';
    const text = message.text.trim();
    const query = extractQuery(text, botUsername);
    console.log('Extracted query:', query);
    
    if (!query) {
      console.log('No query extracted, sending help message');
      const helpMessage = `🔍 *Booking Search Bot*\n\nSend me:\n• Booking number (e.g., 12345)\n• Customer name (e.g., John Smith)\n• Date (e.g., 2024-01-15)\n\nOr use /search <query> for explicit search`;
      await sendTelegram(chat_id, helpMessage, reply_to_message_id);
      return res.json({ ok: true });
    }
    
    // Check if the query matches a SKU in products_rates
    let skuRows = [];
    try {
      skuRows = (await sql.query('SELECT * FROM products_rates WHERE sku = $1 AND type = \'tour\'', [query])).rows;
    } catch (err) {
      console.error('SKU lookup error:', err.message);
      // Continue to booking search logic
    }
    if (skuRows.length > 0) {
      const product = skuRows[0];
      let msg = `*${product.program}*\nSKU: \`${product.sku}\``;
      if (product.rates && Array.isArray(product.rates)) {
        msg += `\n*Rates:*`;
        product.rates.forEach(rate => {
          const adultPrice = rate.net_adult ? `฿${rate.net_adult}` : 'N/A';
          const childPrice = rate.net_child ? `฿${rate.net_child}` : 'N/A';
          msg += `\n• ${rate.name}: Adult ${adultPrice}, Child ${childPrice}`;
        });
      }
      await sendTelegram(chat_id, msg, reply_to_message_id);
      return res.json({ ok: true });
    }

    // Continue with booking search logic
    console.log('Searching for:', query);
    const results = await searchBookings(query);
    console.log('Search results:', results.length);

    if (results.length === 0) {
      console.log('No results found, sending not found message');
      const notFoundMessage = `❌ No bookings found for: *${query}*\n\nTry searching by:\n• Booking number (e.g., 12345)\n• Customer name (e.g., John Smith)\n• Date (e.g., 2024-01-15)`;
      await sendTelegram(chat_id, notFoundMessage, reply_to_message_id);
      return res.json({ ok: true });
    }

    console.log('Sending results');
    const nm = new NotificationManager();
    for (const booking of results) {
      await nm.sendTelegramWithButtons(booking, chat_id);
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error processing Telegram request:', error.message);
    if (error.response) {
      console.error('Telegram API error:', error.response.data);
    }
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}; 