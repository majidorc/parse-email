const { Pool } = require('pg');
const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  const type = req.query.type;
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const userRole = session.role;

  // --- RATES LOGIC ---
  if (type === 'rate') {
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
      if (userRole !== 'admin' && userRole !== 'programs_manager') return res.status(403).json({ error: 'Forbidden: Admins or Programs Manager only' });
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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- PRODUCTS LOGIC ---
  if (type === 'product') {
    if (userRole !== 'admin' && userRole !== 'programs_manager') return res.status(403).json({ error: 'Forbidden: Admins or Programs Manager only' });
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const product_id_optional = req.body.productId || req.body.product_id_optional || null;
    const { sku, program, remark } = req.body;
    const mappedRates = (req.body.rates || []).map(rate => ({
      name: rate.name,
      net_adult: rate.netAdult,
      net_child: rate.netChild,
      fee_type: rate.feeType,
      fee_adult: rate.feeAdult,
      fee_child: rate.feeChild
    }));
    if (!sku || !program || !Array.isArray(mappedRates) || mappedRates.length === 0) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prodResult = await client.query(
        `INSERT INTO products (sku, product_id_optional, program, remark) VALUES ($1, $2, $3, $4) RETURNING id`,
        [sku, product_id_optional, program, remark || null]
      );
      const productId = prodResult.rows[0].id;
      for (const rate of mappedRates) {
        const { name, net_adult, net_child, fee_type, fee_adult, fee_child } = rate;
        if (
          !name || net_adult == null || net_child == null || !fee_type ||
          ((fee_type === 'np' || fee_type === 'entrance') && (fee_adult == null || fee_child == null))
        ) {
          throw new Error('Invalid rate item');
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
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
    return;
  }

  // --- TOURS LOGIC ---
  if (type === 'tour') {
    if (req.method === 'GET') {
      try {
        const client = await pool.connect();
        const productsResult = await client.query('SELECT * FROM products ORDER BY program, sku');
        const products = productsResult.rows;
        const ratesResult = await client.query('SELECT * FROM rates');
        const rates = ratesResult.rows;
        const ratesByProduct = {};
        for (const rate of rates) {
          if (!ratesByProduct[rate.product_id]) ratesByProduct[rate.product_id] = [];
          ratesByProduct[rate.product_id].push(rate);
        }
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
      if (userRole !== 'admin' && userRole !== 'programs_manager') return res.status(403).json({ error: 'Forbidden: Admins or Programs Manager only' });
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
          await client.query(
            `UPDATE products SET sku=$1, product_id_optional=$2, program=$3, remark=$4 WHERE id=$5`,
            [sku, product_id_optional, program, remark || null, id]
          );
          await client.query(`DELETE FROM rates WHERE product_id = $1`, [id]);
        } else {
          const prodResult = await client.query(
            `INSERT INTO products (sku, product_id_optional, program, remark) VALUES ($1, $2, $3, $4) RETURNING id`,
            [sku, product_id_optional, program, remark || null]
          );
          productId = prodResult.rows[0].id;
        }
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
      return res.status(501).json({ error: 'Not implemented' });
    }
    if (req.method === 'DELETE') {
      if (userRole !== 'admin') return res.status(403).json({ error: 'Forbidden: Admins only' });
      const { id } = req.body;
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM rates WHERE product_id = $1', [id]);
        await client.query('DELETE FROM products WHERE id = $1', [id]);
        await client.query('COMMIT');
        res.status(200).json({ success: true });
      } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message, stack: err.stack });
      } finally {
        client.release();
      }
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // If no type matched
  res.status(400).json({ error: 'Missing or invalid type param' });
}; 