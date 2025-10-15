import { sql } from '@vercel/postgres';
import { getSession } from './auth.js';

export default async function handler(req, res) {
  try {
    
    const type = req.query.type;
    
    // Add basic health check for debugging
    if (type === 'health') {
      try {
        const testResult = await sql`SELECT 1 as test`;
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
    
    // Add test endpoint for debugging tour creation
    if (type === 'test-tour') {
      if (req.method === 'POST') {
        try {
          console.log('[PRODUCTS-RATES] Test tour endpoint called with body:', JSON.stringify(req.body, null, 2));
          
          // Test database connection
          const testResult = await sql`SELECT 1 as test`;
          console.log('[PRODUCTS-RATES] Database test result:', testResult.rows[0]);
          
          // Test table existence
          const tablesResult = await sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('products', 'rates')
          `;
          console.log('[PRODUCTS-RATES] Tables found:', tablesResult.rows);
          
          return res.status(200).json({
            status: 'ok',
            database: 'connected',
            tables: tablesResult.rows,
            body: req.body
          });
        } catch (err) {
          console.error('[PRODUCTS-RATES] Test tour endpoint error:', err);
          return res.status(500).json({
            status: 'error',
            error: err.message,
            stack: err.stack
          });
        }
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const session = getSession(req);

    
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    const userRole = session.role;



    // Test database connection and table existence
    try {
      const testResult = await sql`SELECT 1 as test`;

      
      // Check if tables exist
      const tablesResult = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('products', 'rates')
      `;

      console.log('[PRODUCTS-RATES] Database connection test passed, tables found:', tablesResult.rows.length);
      
    } catch (dbErr) {
      console.error('[PRODUCTS-RATES] Database connection test failed:', dbErr);
      return res.status(500).json({ error: 'Database connection failed', details: dbErr.message });
    }

    // --- SUPPLIERS LOGIC ---
    if (type === 'suppliers') {
      if (req.method === 'GET') {
        try {
          const { rows } = await sql`SELECT id, name FROM suppliers ORDER BY name`;
          res.status(200).json({ suppliers: rows });
        } catch (err) {
          console.error('[PRODUCTS-RATES] Error fetching suppliers:', err);
          res.status(500).json({ error: 'Failed to fetch suppliers', details: err.message });
        }
        return;
      }
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
            WHERE p.sku = ${sku} OR p.product_id_optional = ${sku}
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
      try {
        const prodResult = await sql`
          INSERT INTO products (sku, product_id_optional, program, remark) VALUES (${sku}, ${product_id_optional}, ${program}, ${remark || null}) RETURNING id
        `;
        const productId = prodResult.rows[0].id;
        for (const rate of mappedRates) {
          const { name, net_adult, net_child, fee_type, fee_adult, fee_child } = rate;
          if (
            !name || net_adult == null || net_child == null || !fee_type ||
            ((fee_type === 'np' || fee_type === 'entrance') && (fee_adult == null || fee_child == null))
          ) {
            throw new Error('Invalid rate item');
          }
          await sql`
            INSERT INTO rates (product_id, name, net_adult, net_child, fee_type, fee_adult, fee_child) VALUES (${productId}, ${name}, ${net_adult}, ${net_child}, ${fee_type}, ${fee_adult}, ${fee_child})
          `;
        }
        res.status(201).json({ success: true, productId });
      } catch (err) {
        console.error('[PRODUCTS-RATES] Error in product logic:', err);
        res.status(500).json({ error: err.message });
      }
      return;
    }

    // --- TOURS LOGIC ---
    if (type === 'tour') {
      if (req.method === 'GET') {
        try {
          // Check if this is a SKU-specific request for rates
          const sku = req.query.sku;
          if (sku) {
                      // Fetch rates for a specific SKU
          const { rows: rates } = await sql`
            SELECT r.* 
            FROM rates r 
            JOIN products p ON r.product_id = p.id 
            WHERE p.sku = ${sku}
            ORDER BY r.name
          `;
          res.status(200).json({ rates: rates });
          return;
          }
    
          
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
          let totalCount;
          if (search) {
            const { rows: countRows } = await sql`SELECT COUNT(*) as count FROM products p WHERE sku ILIKE ${`%${search}%`} OR program ILIKE ${`%${search}%`} OR remark ILIKE ${`%${search}%`}`;
            totalCount = parseInt(countRows[0].count);
          } else {
            const { rows: countRows } = await sql`SELECT COUNT(*) as count FROM products p`;
            totalCount = parseInt(countRows[0].count);
          }
          
          // Handle sorting
          const { sort = 'sku', dir = 'asc' } = req.query;
          let orderBy = 'p.sku ASC';
          
          if (sort === 'sku') {
            orderBy = dir === 'desc' ? 'p.sku DESC' : 'p.sku ASC';
          } else if (sort === 'program') {
            orderBy = dir === 'desc' ? 'p.program DESC' : 'p.program ASC';
          } else if (sort === 'supplier') {
            orderBy = dir === 'desc' ? 's.name DESC, p.sku ASC' : 's.name ASC, p.sku ASC';
          }
          
          // Get paginated products with supplier info
          let products;
          if (search) {
            const { rows: productsRows } = await sql`
              SELECT p.*, s.name as supplier_name 
              FROM products p 
              LEFT JOIN suppliers s ON p.supplier_id = s.id 
              WHERE p.sku ILIKE ${`%${search}%`} OR p.program ILIKE ${`%${search}%`} OR p.remark ILIKE ${`%${search}%`}
              ORDER BY ${orderBy === 'p.sku ASC' ? sql`p.sku ASC` : orderBy === 'p.sku DESC' ? sql`p.sku DESC` : orderBy === 'p.program DESC' ? sql`p.program DESC` : orderBy === 'p.program ASC' ? sql`p.program ASC` : orderBy === 's.name DESC, p.sku ASC' ? sql`s.name DESC, p.sku ASC` : sql`s.name ASC, p.sku ASC`}
              LIMIT ${limit} OFFSET ${offset}
            `;
            products = productsRows;
          } else {
            const { rows: productsRows } = await sql`
              SELECT p.*, s.name as supplier_name 
              FROM products p 
              LEFT JOIN suppliers s ON p.supplier_id = s.id 
              ORDER BY ${orderBy === 'p.sku ASC' ? sql`p.sku ASC` : orderBy === 'p.sku DESC' ? sql`p.sku DESC` : orderBy === 'p.program DESC' ? sql`p.program DESC` : orderBy === 'p.program ASC' ? sql`p.program ASC` : orderBy === 's.name DESC, p.sku ASC' ? sql`s.name DESC, p.sku ASC` : sql`s.name ASC, p.sku ASC`}
              LIMIT ${limit} OFFSET ${offset}
            `;
            products = productsRows;
          }
    
          
          // Get rates - ALWAYS use fallback query to avoid rate_order issues
          let rates;
          try {
            const { rows: ratesRows } = await sql`SELECT * FROM rates ORDER BY name`;
            rates = ratesRows;
          } catch (err) {
            console.error('[PRODUCTS-RATES] Error fetching rates:', err);
            throw err;
          }
    
          
          const ratesByProduct = {};
          for (const rate of rates) {
            if (!ratesByProduct[rate.product_id]) ratesByProduct[rate.product_id] = [];
            ratesByProduct[rate.product_id].push(rate);
          }
          const productsWithRates = products.map(product => ({
            ...product,
            rates: ratesByProduct[product.id] || []
          }));
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
        
        console.log('[PRODUCTS-RATES] Request body received:', JSON.stringify(req.body, null, 2));
        
        const product_id_optional = req.body.productId || req.body.product_id_optional || null;
        const { sku, program, remark, id, supplier_id } = req.body;
        const rates = req.body.rates || [];
        

        
        if (!sku || !program || !Array.isArray(rates)) {
          console.error('[PRODUCTS-RATES] Missing required fields:', { sku, program, ratesLength: rates.length, ratesType: typeof rates });
          res.status(400).json({ error: 'Missing required fields' });
          return;
        }
        
        console.log('[PRODUCTS-RATES] Validating rates array:', rates.length, 'items');
        rates.forEach((rate, index) => {
          console.log(`[PRODUCTS-RATES] Rate ${index}:`, JSON.stringify(rate, null, 2));
        });
        
        // Allow programs without rates during import
        if (rates.length === 0) {
          console.log('[PRODUCTS-RATES] Program without rates:', { sku, program });
        }
        
        try {
          console.log('[PRODUCTS-RATES] Starting tour POST operation');
          
          let productId = id;
          if (id) {

            // Update all products with the same SKU to have the same supplier_id
            await sql`
              UPDATE products 
              SET sku=${sku}, product_id_optional=${product_id_optional}, program=${program}, remark=${remark || null}, supplier_id=${supplier_id || null} 
              WHERE id=${id}
            `;
            
            // Also update all other products with the same SKU to have the same supplier_id
            if (supplier_id) {
              await sql`
                UPDATE products 
                SET supplier_id=${supplier_id} 
                WHERE sku=${sku} AND id!=${id}
              `;
            }
            
            await sql`DELETE FROM rates WHERE product_id = ${id}`;
          } else {

            
            // Check if SKU already exists
            const existingProduct = await sql`SELECT id FROM products WHERE sku = ${sku}`;
            
            if (existingProduct.rows.length > 0) {
              // For import scenarios, update the existing program instead of failing
              console.log('[PRODUCTS-RATES] SKU already exists, updating existing program:', sku);
              productId = existingProduct.rows[0].id;
              
              // Update the existing product
              await sql`
                UPDATE products 
                SET sku=${sku}, product_id_optional=${product_id_optional}, program=${program}, remark=${remark || null}, supplier_id=${supplier_id || null} 
                WHERE id=${productId}
              `;
              
              // Delete existing rates for this product
              await sql`DELETE FROM rates WHERE product_id = ${productId}`;
            } else {
              const prodResult = await sql`
                INSERT INTO products (sku, product_id_optional, program, remark, supplier_id) 
                VALUES (${sku}, ${product_id_optional}, ${program}, ${remark || null}, ${supplier_id || null}) 
                RETURNING id
              `;
              productId = prodResult.rows[0].id;
            }

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
            

            
            if (!name) {
              throw new Error(`Rate ${i + 1}: Missing rate name`);
            }
            if (net_adult === null || net_adult === undefined) {
              throw new Error(`Rate ${i + 1}: Missing or invalid net adult price`);
            }
            if (net_child === null || net_child === undefined) {
              throw new Error(`Rate ${i + 1}: Missing or invalid net child price`);
            }
            if (!fee_type) {
              throw new Error(`Rate ${i + 1}: Missing fee type`);
            }
            if ((fee_type === 'np' || fee_type === 'entrance') && (fee_adult === null || fee_adult === undefined)) {
              throw new Error(`Rate ${i + 1}: Missing fee adult price for fee type '${fee_type}'`);
            }
            if ((fee_type === 'np' || fee_type === 'entrance') && (fee_child === null || fee_child === undefined)) {
              throw new Error(`Rate ${i + 1}: Missing fee child price for fee type '${fee_type}'`);
            }
            
            // ALWAYS use the fallback query to avoid rate_order issues
            console.log(`[PRODUCTS-RATES] Inserting rate ${i}:`, { productId, name, net_adult, net_child, fee_type, fee_adult, fee_child });

            await sql`
              INSERT INTO rates (product_id, name, net_adult, net_child, fee_type, fee_adult, fee_child) 
              VALUES (${productId}, ${name}, ${net_adult}, ${net_child}, ${fee_type}, ${fee_adult}, ${fee_child})
            `;
          }
          

          console.log('[PRODUCTS-RATES] Tour POST operation completed successfully, productId:', productId);
          res.status(201).json({ success: true, productId });
        } catch (err) {
          console.error('[PRODUCTS-RATES] Error in tour POST logic:', err);
          console.error('[PRODUCTS-RATES] Error stack:', err.stack);
          console.error('[PRODUCTS-RATES] Error code:', err.code);
          console.error('[PRODUCTS-RATES] Error detail:', err.detail);
          console.error('[PRODUCTS-RATES] Error hint:', err.hint);
          
          // No rollback needed since we're not using transactions
          
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
        try {
          await sql`DELETE FROM rates WHERE product_id = ${id}`;
          await sql`DELETE FROM products WHERE id = ${id}`;
          res.status(200).json({ success: true });
        } catch (err) {
          console.error('[PRODUCTS-RATES] Error in tour DELETE logic:', err);
          res.status(500).json({ error: err.message, stack: err.stack });
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

        const booking = rows[0];
        
        // Update the rate and recalculate net price in a single transaction
        if (booking.sku && rate) {
          console.log(`[DEBUG] Processing rate update for booking ${booking_number}: SKU=${booking.sku}, newRate=${rate}, currentRate=${booking.rate}`);
          console.log(`[DEBUG] Booking details: adult=${booking.adult}, child=${booking.child}`);
          
          try {
            // Get the new rate information
            const { rows: rateRows } = await sql`
              SELECT r.net_adult, r.net_child, r.fee_adult, r.fee_child, r.fee_type
              FROM rates r
              JOIN products p ON r.product_id = p.id
              WHERE p.sku = ${booking.sku} AND LOWER(TRIM(r.name)) = LOWER(TRIM(${rate}))
              LIMIT 1
            `;
            
            console.log(`[DEBUG] Rate query result: ${rateRows.length} rows found`);
            if (rateRows.length > 0) {
              const rateInfo = rateRows[0];
              console.log(`[DEBUG] Rate info:`, rateInfo);
              
              // Calculate new net_total based on passengers and new rates
              let netTotal = 0;
              
              if (booking.adult > 0) {
                netTotal += (Number(rateInfo.net_adult) * Number(booking.adult));
                if (rateInfo.fee_type === 'per_person' && rateInfo.fee_adult) {
                  netTotal += (Number(rateInfo.fee_adult) * Number(booking.adult));
                }
              }
              
              if (booking.child > 0) {
                netTotal += (Number(rateInfo.net_child) * Number(booking.child));
                if (rateInfo.fee_type === 'per_person' && rateInfo.fee_child) {
                  netTotal += (Number(rateInfo.fee_child) * Number(booking.child));
                }
              }
              
              if (rateInfo.fee_type === 'total' && rateInfo.fee_adult) {
                netTotal += Number(rateInfo.fee_adult);
              }
              
              console.log(`[DEBUG] Calculated net total: ${netTotal}`);
              
              // Update both rate and net_total in a single query
              const updateResult = await sql`
                UPDATE bookings 
                SET rate = ${rate},
                    net_total = ${netTotal}, 
                    updated_fields = COALESCE(updated_fields, '{}'::jsonb) || jsonb_build_object('net_total_recalculated', true, 'recalculated_at', ${new Date().toISOString()})
                WHERE booking_number = ${booking_number}
              `