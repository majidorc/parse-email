const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const { rows } = await sql`SELECT * FROM rates ORDER BY name`;
      res.status(200).json({ rates: rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch rates', details: err.message });
    }
    return;
  }
  if (req.method === 'POST') {
    const { name, net_adult, net_child, fee_type, fee_adult, fee_child, product_id } = req.body;
    if (!name || net_adult === undefined || net_child === undefined || !fee_type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
      const { rows } = await sql`
        INSERT INTO rates (product_id, name, net_adult, net_child, fee_type, fee_adult, fee_child)
        VALUES (${product_id}, ${name}, ${net_adult}, ${net_child}, ${fee_type}, ${fee_adult}, ${fee_child})
        RETURNING *
      `;
      res.status(201).json({ rate: rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'Failed to add rate', details: err.message });
    }
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}; 