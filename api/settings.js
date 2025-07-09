const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    // Return the latest settings row (if any)
    const { rows } = await sql`SELECT * FROM settings ORDER BY updated_at DESC LIMIT 1;`;
    if (rows.length === 0) {
      return res.status(200).json({
        bokun_api_key: '',
        woocommerce_api_key: '',
        woocommerce_api_secret: '',
        use_bokun_api: false
      });
    }
    const s = rows[0];
    return res.status(200).json({
      bokun_api_key: s.bokun_api_key || '',
      woocommerce_api_key: s.woocommerce_api_key || '',
      woocommerce_api_secret: s.woocommerce_api_secret || '',
      use_bokun_api: !!s.use_bokun_api
    });
  }
  if (req.method === 'POST') {
    const { bokun_api_key, woocommerce_api_key, woocommerce_api_secret, use_bokun_api } = req.body || {};
    await sql`
      INSERT INTO settings (bokun_api_key, woocommerce_api_key, woocommerce_api_secret, use_bokun_api, updated_at)
      VALUES (${bokun_api_key || ''}, ${woocommerce_api_key || ''}, ${woocommerce_api_secret || ''}, ${!!use_bokun_api}, NOW())
    `;
    return res.status(200).json({ success: true });
  }
  res.status(405).json({ error: 'Method Not Allowed' });
}; 