const { sql } = require('@vercel/postgres');
const crypto = require('crypto');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'changeme';
const COOKIE_NAME = 'session_token';

function verifyTelegramAuth(data) {
  // https://core.telegram.org/widgets/login#checking-authorization
  const authData = { ...data };
  const hash = authData.hash;
  delete authData.hash;
  const keys = Object.keys(authData).sort();
  const dataCheckString = keys.map(k => `${k}=${authData[k]}`).join('\n');
  const secret = crypto.createHash('sha256').update(TELEGRAM_BOT_TOKEN).digest();
  const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return hmac === hash;
}

function signSession(phone, role) {
  const payload = JSON.stringify({ phone, role, t: Date.now() });
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + sig;
}
function verifySession(token) {
  if (!token) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  const payload = Buffer.from(payloadB64, 'base64').toString();
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  if (sig !== expectedSig) return null;
  try {
    const data = JSON.parse(payload);
    if (!data.phone || !data.role) return null;
    return data;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  const type = req.query.type;
  if (type === 'login' && req.method === 'POST') {
    const data = req.body || {};
    if (!verifyTelegramAuth(data)) return res.status(401).json({ error: 'Invalid Telegram login' });
    const phone = data.phone_number;
    if (!phone) return res.status(400).json({ error: 'No phone number from Telegram' });
    const { rows } = await sql`SELECT role, is_active FROM user_whitelist WHERE phone_number = ${phone}`;
    if (!rows.length || !rows[0].is_active) return res.status(403).json({ error: 'Not whitelisted' });
    const role = rows[0].role;
    const token = signSession(phone, role);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`);
    return res.status(200).json({ success: true, phone, role });
  }
  if (type === 'logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0`);
    return res.status(200).json({ success: true });
  }
  if (type === 'session' && req.method === 'GET') {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    const token = match ? match[1] : null;
    const session = verifySession(token);
    if (!session) return res.status(200).json({ isAuthenticated: false });
    return res.status(200).json({ isAuthenticated: true, phone: session.phone, role: session.role });
  }
  res.status(405).json({ error: 'Method Not Allowed' });
}; 