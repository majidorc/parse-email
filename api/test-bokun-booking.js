const axios = require('axios');
const crypto = require('crypto');
const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing booking id' });

  // Get keys from settings
  const { rows } = await sql`SELECT * FROM settings ORDER BY updated_at DESC LIMIT 1;`;
  const bokunAccessKey = rows[0].bokun_access_key;
  const bokunSecretKey = rows[0].bokun_secret_key;

  const method = 'GET';
  const path = `/v1/bookings/${id}`;
  const host = 'api.bokun.io';
  const date = new Date().toISOString();
  const stringToSign = `${method}\n${path}\n${date}`;
  const signature = crypto.createHmac('sha256', bokunSecretKey)
    .update(stringToSign)
    .digest('hex');
  const headers = {
    'Bokun-AccessKey': bokunAccessKey,
    'Bokun-Date': date,
    'Bokun-Signature': signature,
    'Content-Type': 'application/json'
  };
  const url = `https://${host}${path}`;
  try {
    const response = await axios.get(url, { headers, validateStatus: () => true });
    // Log status and headers for debugging
    console.log('Bokun API status:', response.status);
    console.log('Bokun API headers:', response.headers);
    // Detect HTML response
    if (typeof response.data === 'string' && response.data.trim().startsWith('<!DOCTYPE html>')) {
      return res.status(502).json({ error: 'Received HTML from Bokun API. This usually means authentication failed or the endpoint is incorrect.', status: response.status, headers: response.headers, body: response.data.slice(0, 200) });
    }
    // If Bokun returns an error as JSON
    if (response.status >= 400) {
      return res.status(response.status).json({ error: 'Bokun API error', status: response.status, headers: response.headers, body: response.data });
    }
    res.status(200).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
}; 