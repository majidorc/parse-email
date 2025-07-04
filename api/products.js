const { Pool } = require('pg');

// Configure your Neon/Postgres connection here
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Accept both camelCase and snake_case for productId
  const product_id_optional = req.body.productId || req.body.product_id_optional || null;
  const { sku, program, remark } = req.body;
  // Map frontend rates fields to backend fields
  const mappedRates = (req.body.rates || []).map(rate => ({
    net_adult: rate.netAdult,
    net_child: rate.netChild,
    fee_type: rate.feeType,
    fee_adult: rate.feeAdult,
    fee_child: rate.feeChild
  }));
  // Basic validation
  if (!sku || !program || !Array.isArray(mappedRates) || mappedRates.length === 0) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Insert product
    const prodResult = await client.query(
      `INSERT INTO products (sku, product_id_optional, program, remark) VALUES ($1, $2, $3, $4) RETURNING id`,
      [sku, product_id_optional, program, remark || null]
    );
    const productId = prodResult.rows[0].id;
    // Insert rates
    for (const rate of mappedRates) {
      const { net_adult, net_child, fee_type, fee_adult, fee_child } = rate;
      if (
        net_adult == null || net_child == null || !fee_type ||
        ((fee_type === 'np' || fee_type === 'entrance') && (fee_adult == null || fee_child == null))
      ) {
        throw new Error('Invalid rate item');
      }
      await client.query(
        `INSERT INTO rates (product_id, net_adult, net_child, fee_type, fee_adult, fee_child) VALUES ($1, $2, $3, $4, $5, $6)`,
        [productId, net_adult, net_child, fee_type, fee_adult, fee_child]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, productId });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}; 