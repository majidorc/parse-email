const { Pool } = require('pg');

// Configure your Neon/Postgres connection here
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    // List all products with their rates
    try {
      const client = await pool.connect();
      // Get all products
      const productsResult = await client.query('SELECT * FROM products ORDER BY program, sku');
      const products = productsResult.rows;
      // Get all rates
      const ratesResult = await client.query('SELECT * FROM rates');
      const rates = ratesResult.rows;
      // Group rates by product_id
      const ratesByProduct = {};
      for (const rate of rates) {
        if (!ratesByProduct[rate.product_id]) ratesByProduct[rate.product_id] = [];
        ratesByProduct[rate.product_id].push(rate);
      }
      // Attach rates to products
      const productsWithRates = products.map(product => ({
        ...product,
        rates: ratesByProduct[product.id] || []
      }));
      client.release();
      res.status(200).json({ tours: productsWithRates });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch programs', details: err.stack });
    }
    return;
  }
  if (req.method === 'POST') {
    // Upsert logic: if id is present, update; else insert new
    const product_id_optional = req.body.productId || req.body.product_id_optional || null;
    const { sku, program, remark, id } = req.body;
    const rates = req.body.rates || [];
    if (!sku || !program || !Array.isArray(rates) || rates.length === 0) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let productId = id;
      if (id) {
        // Update product
        await client.query(
          `UPDATE products SET sku=$1, product_id_optional=$2, program=$3, remark=$4 WHERE id=$5`,
          [sku, product_id_optional, program, remark || null, id]
        );
        // Delete all existing rates for this product
        await client.query(`DELETE FROM rates WHERE product_id = $1`, [id]);
      } else {
        // Insert product
        const prodResult = await client.query(
          `INSERT INTO products (sku, product_id_optional, program, remark) VALUES ($1, $2, $3, $4) RETURNING id`,
          [sku, product_id_optional, program, remark || null]
        );
        productId = prodResult.rows[0].id;
      }
      // Insert all rates
      for (const rate of rates) {
        const { name, net_adult, net_child, fee_type, fee_adult, fee_child } = rate;
        if (
          !name || net_adult == null || net_child == null || !fee_type ||
          ((fee_type === 'np' || fee_type === 'entrance') && (fee_adult == null || fee_child == null))
        ) {
          throw new Error('Invalid rate item: ' + JSON.stringify(rate));
        }
        await client.query(
          `INSERT INTO rates (product_id, name, net_adult, net_child, fee_type, fee_adult, fee_child) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [productId, name, net_adult, net_child, fee_type, fee_adult, fee_child]
        );
      }
      await client.query('COMMIT');
      res.status(201).json({ success: true, productId });
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message, stack: err.stack });
    } finally {
      client.release();
    }
    return;
  }
  if (req.method === 'PUT') {
    // TODO: Implement update logic for products and rates
    res.status(501).json({ error: 'Not implemented' });
    return;
  }
  if (req.method === 'DELETE') {
    // TODO: Implement delete logic for products and rates
    res.status(501).json({ error: 'Not implemented' });
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}; 