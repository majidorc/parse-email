const { sql } = require('@vercel/postgres');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');

const GOOGLE_CLIENT_ID = '342250702349-vff0rim280bq31rer6vpm3u7gps965om.apps.googleusercontent.com';
const SESSION_SECRET = process.env.SESSION_SECRET || 'changeme';
const COOKIE_NAME = 'session_token';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

function signSession(email, role) {
  const payload = JSON.stringify({ email, role, t: Date.now() });
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
    if (!data.email || !data.role) return null;
    return data;
  } catch {
    return null;
  }
}

async function verifyGoogleToken(id_token) {
  const ticket = await client.verifyIdToken({ idToken: id_token, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  return payload;
}

module.exports = async (req, res) => {
  const type = req.query.type;
  if (type === 'login' && req.method === 'POST') {
    const { id_token } = req.body || {};
    if (!id_token) return res.status(400).json({ error: 'Missing id_token' });
    let payload;
    try {
      payload = await verifyGoogleToken(id_token);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    const email = payload.email;
    if (!email) return res.status(400).json({ error: 'No email from Google' });
    const { rows } = await sql`SELECT role, is_active FROM user_whitelist WHERE email = ${email}`;
    if (!rows.length || !rows[0].is_active) return res.status(403).json({ error: 'Not whitelisted' });
    const role = rows[0].role;
    const token = signSession(email, role);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`);
    return res.status(200).json({ success: true, email, role });
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
    return res.status(200).json({ isAuthenticated: true, email: session.email, role: session.role });
  }
  res.status(405).json({ error: 'Method Not Allowed' });
};

// Export helpers for use in other APIs
module.exports.verifySession = verifySession;
module.exports.getSession = function(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const token = match ? match[1] : null;
  return verifySession(token);
}; 