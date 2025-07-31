const { Pool } = require('pg');
const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  try {
    const type = req.query.type;
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    const userRole = session.role;

    console.log(`[PRODUCTS-RATES] ${req.method} request for type: ${type}, userRole: ${userRole}`);

    // --- RATES LOGIC ---
    if (type === 'rate') {
      if (req.method === 'GET') {
        try {
          const { rows } = await sql`SELECT * FROM rates ORDER BY name`;
          res.status(200).json({ rates: rows });
        } catch (err) {
          console.error('[PRODUCTS-RATES] Error fetching rates:', err);
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
          console.error('[PRODUCTS-RATES] Error adding rate:', err);
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
        console.error('[PRODUCTS-RATES] Error in product logic:', err);
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
          console.log('[PRODUCTS-RATES] Connected to database for GET tours');
          
          const productsResult = await client.query('SELECT * FROM products ORDER BY program, sku');
          const products = productsResult.rows;
          console.log(`[PRODUCTS-RATES] Found ${products.length} products`);
          
          // Get rates
          let ratesResult;
          try {
            ratesResult = await client.query('SELECT * FROM rates ORDER BY product_id, rate_order, name');
            console.log('[PRODUCTS-RATES] Using rate_order column for rates query');
          } catch (err) {
            // If rate_order column doesn't exist, use the old query
            if (err.message.includes('rate_order')) {
              console.log('[PRODUCTS-RATES] rate_order column not found, using fallback query');
              ratesResult = await client.query('SELECT * FROM rates ORDER BY name');
            } else {
              throw err;
            }
          }
          const rates = ratesResult.rows;
          console.log(`[PRODUCTS-RATES] Found ${rates.length} rates`);
          
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
          console.error('[PRODUCTS-RATES] Error fetching tours:', err);
          res.status(500).json({ error: 'Failed to fetch programs', details: err.stack });
        }
        return;
      }
      if (req.method === 'POST') {
        if (userRole !== 'admin' && userRole !== 'programs_manager') return res.status(403).json({ error: 'Forbidden: Admins or Programs Manager only' });
        
        console.log('[PRODUCTS-RATES] Processing POST request for tour with data:', JSON.stringify(req.body, null, 2));
        
        const product_id_optional = req.body.productId || req.body.product_id_optional || null;
        const { sku, program, remark, id } = req.body;
        const rates = req.body.rates || [];
        
        if (!sku || !program || !Array.isArray(rates) || rates.length === 0) {
          console.error('[PRODUCTS-RATES] Missing required fields:', { sku, program, ratesLength: rates.length });
          res.status(400).json({ error: 'Missing required fields' });
          return;
        }
        
        const client = await pool.connect();
        try {
          console.log('[PRODUCTS-RATES] Starting database transaction');
          await client.query('BEGIN');
          
          let productId = id;
          if (id) {
            console.log('[PRODUCTS-RATES] Updating existing product with ID:', id);
            await client.query(
              `UPDATE products SET sku=$1, product_id_optional=$2, program=$3, remark=$4 WHERE id=$5`,
              [sku, product_id_optional, program, remark || null, id]
            );
            await client.query(`DELETE FROM rates WHERE product_id = $1`, [id]);
          } else {
            console.log('[PRODUCTS-RATES] Creating new product');
            const prodResult = await client.query(
              `INSERT INTO products (sku, product_id_optional, program, remark) VALUES ($1, $2, $3, $4) RETURNING id`,
              [sku, product_id_optional, program, remark || null]
            );
            productId = prodResult.rows[0].id;
            console.log('[PRODUCTS-RATES] Created product with ID:', productId);
          }
          
          console.log(`[PRODUCTS-RATES] Processing ${rates.length} rates`);
          for (let i = 0; i < rates.length; i++) {
            const rate = rates[i];
            const { name, net_adult, net_child, fee_type, fee_adult, fee_child, order } = rate;
            
            console.log(`[PRODUCTS-RATES] Processing rate ${i + 1}:`, { name, net_adult, net_child, fee_type, fee_adult, fee_child, order });
            
            if (
              !name || net_adult == null || net_child == null || !fee_type ||
              ((fee_type === 'np' || fee_type === 'entrance') && (fee_adult == null || fee_child == null))
            ) {
              throw new Error('Invalid rate item: ' + JSON.stringify(rate));
            }
            const rateOrder = order !== undefined ? order : i;
            
            // Check if rate_order column exists, if not use the old query
            try {
              console.log('[PRODUCTS-RATES] Trying to insert rate with rate_order column');
              await client.query(
                `INSERT INTO rates (product_id, name, net_adult, net_child, fee_type, fee_adult, fee_child, rate_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [productId, name, net_adult, net_child, fee_type, fee_adult, fee_child, rateOrder]
              );
            } catch (err) {
              // If rate_order column doesn't exist, use the old query
              if (err.message.includes('rate_order')) {
                console.log('[PRODUCTS-RATES] rate_order column not found, using fallback insert');
                await client.query(
                  `INSERT INTO rates (product_id, name, net_adult, net_child, fee_type, fee_adult, fee_child) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                  [productId, name, net_adult, net_child, fee_type, fee_adult, fee_child]
                );
              } else {
                throw err;
              }
            }
          }
          
          console.log('[PRODUCTS-RATES] Committing transaction');
          await client.query('COMMIT');
          res.status(201).json({ success: true, productId });
        } catch (err) {
          console.error('[PRODUCTS-RATES] Error in tour POST logic:', err);
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
          console.error('[PRODUCTS-RATES] Error in tour DELETE logic:', err);
          res.status(500).json({ error: err.message, stack: err.stack });
        } finally {
          client.release();
        }
        return;
      }
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // --- UPDATE RATE LOGIC ---
    if (req.method === 'GET' && req.query.booking_number) {
      // Debug mode - show booking and email info
      const { booking_number } = req.query;

      try {
        // Get booking info
        const { rows: bookingRows } = await sql`SELECT * FROM bookings WHERE booking_number = ${booking_number}`;
        if (!bookingRows.length) {
          return res.status(404).json({ error: 'Booking not found' });
        }

        // Get email info
        const { rows: emailRows } = await sql`
          SELECT sender, subject, parsed_at 
          FROM parsed_emails 
          WHERE booking_number = ${booking_number}
          ORDER BY parsed_at DESC
          LIMIT 1
        `;

        return res.status(200).json({
          booking: {
            booking_number: bookingRows[0].booking_number,
            rate: bookingRows[0].rate,
            program: bookingRows[0].program,
            sku: bookingRows[0].sku,
            customer_name: bookingRows[0].customer_name
          },
          email: emailRows.length > 0 ? {
            sender: emailRows[0].sender,
            subject: emailRows[0].subject,
            parsed_at: emailRows[0].parsed_at
          } : null
        });
      } catch (err) {
        console.error('Debug error:', err);
        return res.status(500).json({ error: 'Failed to get debug info', details: err.message });
      }
    }

    if (req.method === 'POST' && req.body.booking_number && req.body.rate) {
      const { booking_number, rate } = req.body;

      try {
        // Check if booking exists
        const { rows } = await sql`SELECT * FROM bookings WHERE booking_number = ${booking_number}`;
        if (!rows.length) {
          return res.status(404).json({ error: 'Booking not found' });
        }

        // Update the rate
        await sql`UPDATE bookings SET rate = ${rate} WHERE booking_number = ${booking_number}`;
        
        return res.status(200).json({ 
          success: true, 
          message: `Rate updated for booking ${booking_number}`,
          rate: rate
        });
      } catch (err) {
        console.error('Failed to update rate:', err);
        return res.status(500).json({ error: 'Failed to update rate', details: err.message });
      }
    }

    // If no type matched
    res.status(400).json({ error: 'Missing or invalid type param' });
  } catch (error) {
    console.error('[PRODUCTS-RATES] Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}; 