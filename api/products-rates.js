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
    
    // Add basic health check for debugging
    if (type === 'health') {
      try {
        const testClient = await pool.connect();
        const testResult = await testClient.query('SELECT 1 as test');
        testClient.release();
        return res.status(200).json({ 
          status: 'ok', 
          database: 'connected',
          test: testResult.rows[0]
        });
      } catch (dbErr) {
        return res.status(500).json({ 
          status: 'error', 
          database: 'failed',
          error: dbErr.message 
        });
      }
    }
    
    // Add echo test for debugging POST requests
    if (type === 'echo') {
      return res.status(200).json({
        method: req.method,
        body: req.body,
        headers: req.headers,
        query: req.query
      });
    }
    
    const session = getSession(req);

    
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    const userRole = session.role;



    // Test database connection and table existence
    try {
      const testClient = await pool.connect();
      const testResult = await testClient.query('SELECT 1 as test');

      
      // Check if tables exist
      const tablesResult = await testClient.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('products', 'rates')
      `);

      
      testClient.release();
    } catch (dbErr) {
      console.error('[PRODUCTS-RATES] Database connection test failed:', dbErr);
      return res.status(500).json({ error: 'Database connection failed', details: dbErr.message });
    }

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

    // --- RATES BY SKU LOGIC ---
    if (type === 'rates-by-sku') {
      if (req.method === 'GET') {
        const { sku } = req.query;
        if (!sku) {
          return res.status(400).json({ error: 'SKU parameter is required' });
        }
        try {
          const { rows } = await sql`
            SELECT r.id, r.name, r.net_adult, r.net_child, r.fee_type, r.fee_adult, r.fee_child
            FROM rates r
            JOIN products p ON r.product_id = p.id
            WHERE p.sku = ${sku}
            ORDER BY r.name
          `;
          res.status(200).json({ rates: rows });
        } catch (err) {
          console.error('[PRODUCTS-RATES] Error fetching rates by SKU:', err);
          res.status(500).json({ error: 'Failed to fetch rates', details: err.message });
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
    
          
          // Pagination parameters
          const page = parseInt(req.query.page) || 1;
          const limit = parseInt(req.query.limit) || 10;
          const offset = (page - 1) * limit;
          const search = req.query.search || '';
          
          // Build WHERE clause for search
          let whereClause = '';
          let params = [];
          if (search) {
            whereClause = 'WHERE sku ILIKE $1 OR program ILIKE $1 OR remark ILIKE $1';
            params = [`%${search}%`];
          }
          
          // Get total count for pagination
          const countQuery = `SELECT COUNT(*) FROM products ${whereClause}`;
          const countResult = await client.query(countQuery, params);
          const totalCount = parseInt(countResult.rows[0].count);
          
          // Get paginated products
          const productsQuery = `SELECT * FROM products ${whereClause} ORDER BY program, sku LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
          const productsResult = await client.query(productsQuery, [...params, limit, offset]);
          const products = productsResult.rows;
    
          
          // Get rates - ALWAYS use fallback query to avoid rate_order issues
          let ratesResult;
          try {
      
            ratesResult = await client.query('SELECT * FROM rates ORDER BY name');
          } catch (err) {
            console.error('[PRODUCTS-RATES] Error fetching rates:', err);
            throw err;
          }
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
          res.status(200).json({ 
            tours: productsWithRates,
            pagination: {
              page,
              limit,
              total: totalCount,
              totalPages: Math.ceil(totalCount / limit)
            }
          });
        } catch (err) {
          console.error('[PRODUCTS-RATES] Error fetching tours:', err);
          res.status(500).json({ error: 'Failed to fetch programs', details: err.stack });
        }
        return;
      }
      if (req.method === 'POST') {
        
        
        if (userRole !== 'admin' && userRole !== 'programs_manager') {
  
          return res.status(403).json({ error: 'Forbidden: Admins or Programs Manager only' });
        }
        

        
        // Ensure req.body is an object
        if (!req.body || typeof req.body !== 'object') {
          console.error('[PRODUCTS-RATES] Invalid request body:', req.body);
          res.status(400).json({ error: 'Invalid request body' });
          return;
        }
        
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
  
          await client.query('BEGIN');
          
          let productId = id;
          if (id) {

            await client.query(
              `UPDATE products SET sku=$1, product_id_optional=$2, program=$3, remark=$4 WHERE id=$5`,
              [sku, product_id_optional, program, remark || null, id]
            );
            await client.query(`DELETE FROM rates WHERE product_id = $1`, [id]);
          } else {

            
            // Check if SKU already exists
            const existingProduct = await client.query(
              `SELECT id FROM products WHERE sku = $1`,
              [sku]
            );
            
            if (existingProduct.rows.length > 0) {
  
              await client.query('ROLLBACK');
              res.status(409).json({ 
                error: 'Program with this SKU already exists',
                existingId: existingProduct.rows[0].id
              });
              return;
            }
            
            const prodResult = await client.query(
              `INSERT INTO products (sku, product_id_optional, program, remark) VALUES ($1, $2, $3, $4) RETURNING id`,
              [sku, product_id_optional, program, remark || null]
            );
            productId = prodResult.rows[0].id;

          }
          

          for (let i = 0; i < rates.length; i++) {
            const rate = rates[i];
            const { name, netAdult, netChild, feeType, feeAdult, feeChild, order } = rate;
            
            // Map frontend field names to database field names
            const net_adult = netAdult;
            const net_child = netChild;
            const fee_type = feeType;
            // Set fee values to NULL when fee_type is 'none' to satisfy database constraints
            const fee_adult = (feeType === 'none') ? null : feeAdult;
            const fee_child = (feeType === 'none') ? null : feeChild;
            

            
            if (
              !name || net_adult === null || net_child === null || !fee_type ||
              ((fee_type === 'np' || fee_type === 'entrance') && (fee_adult === null || fee_child === null))
            ) {
              throw new Error('Invalid rate item: ' + JSON.stringify(rate));
            }
            
            // ALWAYS use the fallback query to avoid rate_order issues

            await client.query(
              `INSERT INTO rates (product_id, name, net_adult, net_child, fee_type, fee_adult, fee_child) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [productId, name, net_adult, net_child, fee_type, fee_adult, fee_child]
            );
          }
          

          await client.query('COMMIT');
          res.status(201).json({ success: true, productId });
        } catch (err) {
          console.error('[PRODUCTS-RATES] Error in tour POST logic:', err);
          console.error('[PRODUCTS-RATES] Error stack:', err.stack);
          console.error('[PRODUCTS-RATES] Error code:', err.code);
          console.error('[PRODUCTS-RATES] Error detail:', err.detail);
          console.error('[PRODUCTS-RATES] Error hint:', err.hint);
          
          if (client) {
            try {
              await client.query('ROLLBACK');
            } catch (rollbackErr) {
              console.error('[PRODUCTS-RATES] Rollback error:', rollbackErr);
            }
          }
          
          // Check for specific database errors
          let errorMessage = 'Failed to create/update program';
          if (err.code === '23505') {
            errorMessage = 'Program with this SKU already exists';
          } else if (err.code === '23502') {
            errorMessage = 'Missing required field';
          } else if (err.code === '23503') {
            errorMessage = 'Foreign key constraint violation';
          }
          
          res.status(500).json({ 
            error: errorMessage, 
            details: err.message,
            code: err.code,
            hint: err.hint,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
          });
        } finally {
          if (client) {
            client.release();
          }
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