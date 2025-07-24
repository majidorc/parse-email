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
  const token = await getTelegramBotToken();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const chatId = chat_id || await getTelegramChatId();
  const payload = {
    chat_id: chatId,
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

// Helper to search products/programs
async function searchProducts(query) {
  // Try SKU (exact)
  let sqlQuery = 'SELECT * FROM products_rates WHERE sku = $1 AND type = \'tour\'';
  let params = [query];
  let { rows } = await sql.query(sqlQuery, params);
  if (rows.length > 0) return rows;
  
  // Try program name (partial, case-insensitive)
  sqlQuery = 'SELECT * FROM products_rates WHERE program ILIKE $1 AND type = \'tour\' ORDER BY program ASC LIMIT 5';
  params = [`%${query}%`];
  rows = (await sql.query(sqlQuery, params)).rows;
  if (rows.length > 0) return rows;
  
  // Try rate name (partial, case-insensitive)
  sqlQuery = `
    SELECT DISTINCT p.* 
    FROM products_rates p 
    JOIN jsonb_array_elements(p.rates) AS rate ON true 
    WHERE rate->>'name' ILIKE $1 AND p.type = 'tour' 
    ORDER BY p.program ASC 
    LIMIT 5
  `;
  params = [`%${query}%`];
  rows = (await sql.query(sqlQuery, params)).rows;
  if (rows.length > 0) return rows;
  
  return [];
}

// Helper to format product search results
function formatProductResults(products) {
  if (products.length === 0) return 'No products found.';
  
  let result = `*Found ${products.length} product(s):*\n\n`;
  
  products.forEach((product, index) => {
    result += `*${index + 1}. ${product.program}*\n`;
    result += `SKU: \`${product.sku}\`\n`;
    
    if (product.rates && Array.isArray(product.rates)) {
      result += `*Rates:*\n`;
      product.rates.forEach(rate => {
        const adultPrice = rate.net_adult ? `฿${rate.net_adult}` : 'N/A';
        const childPrice = rate.net_child ? `฿${rate.net_child}` : 'N/A';
        result += `• ${rate.name}: Adult ${adultPrice}, Child ${childPrice}\n`;
      });
    }
    
    result += '\n';
  });
  
  return result;
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
    // Get sender's phone number via Telegram (if available)
    const from = message.from || {};
    const telegramUserId = from.id;
    if (!telegramUserId) {
      await sendTelegram(chat_id, 'Access denied. Telegram user ID not found.', reply_to_message_id);
      return res.json({ ok: true });
    }
    // Check whitelist by telegram_user_id
    const { rows } = await sql`SELECT is_active FROM user_whitelist WHERE telegram_user_id = ${telegramUserId}`;
    if (!rows.length || !rows[0].is_active) {
      await sendTelegram(chat_id, 'You are not authorized to use this bot. Please contact the admin to be whitelisted.', reply_to_message_id);
      return res.json({ ok: true });
    }
    // Try to get bot username from environment (optional, fallback to generic)
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || '';
    const text = message.text.trim();
    
    // Handle /products command
    if (text.startsWith('/products')) {
      const query = text.replace(/^\/products(@\w+)?\s*/i, '').trim();
      if (!query) {
        await sendTelegram(chat_id, 'Please send /products <search term> to search for tours and programs.\n\nExamples:\n/products Bangkok\n/products SKU123\n/products Adventure', reply_to_message_id);
        return res.json({ ok: true });
      }
      
      const products = await searchProducts(query);
      const formattedResults = formatProductResults(products);
      await sendTelegram(chat_id, formattedResults, reply_to_message_id);
      return res.json({ ok: true });
    }
    
    // Handle /search command (existing booking search)
    const query = extractQuery(text, botUsername);
    if (!query) {
      await sendTelegram(chat_id, 'Available commands:\n\n/search <booking number/name/date> - Search bookings\n/products <search term> - Search tours and programs', reply_to_message_id);
      return res.json({ ok: true });
    }
    const results = await searchBookings(query);
    if (results.length === 0) {
      await sendTelegram(chat_id, 'No bookings found for your query.', reply_to_message_id);
      return res.json({ ok: true });
    }
    const nm = new NotificationManager();
    for (const booking of results) {
      // Use the unified inline keyboard with buttons, reply in the same chat
      await nm.sendTelegramWithButtons(booking, chat_id);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('Telegram bot error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}; 