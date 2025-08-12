const { Pool } = require('pg');

// For Vercel serverless functions, we need to create a new connection each time
// This is the recommended pattern for Neon + Vercel
const createPool = () => {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1, // Limit connections for serverless
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
};

module.exports = async function handler(req, res) {
  let client;
  let pool;
  
  try {
    pool = createPool();
    client = await pool.connect();
    
    const { method } = req;
    
    switch (method) {
      case 'GET':
        await handleGet(req, res, client);
        break;
      case 'POST':
        await handlePost(req, res, client);
        break;
      case 'PUT':
        await handlePut(req, res, client);
        break;
      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT']);
        res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (err) {
    console.error('Suppliers API error:', err);
    
    // Log the full error for debugging
    console.error('Full error details:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      where: err.where,
      schema: err.schema,
      table: err.table,
      column: err.column,
      dataType: err.dataType,
      constraint: err.constraint
    });
    
    // Provide specific error messages
    if (err.code === 'ECONNREFUSED') {
      res.status(500).json({ error: 'Database connection refused. Please check your database configuration.' });
    } else if (err.code === 'ENOTFOUND') {
      res.status(500).json({ error: 'Database host not found. Please check your database URL.' });
    } else if (err.code === '28P01') {
      res.status(500).json({ error: 'Database authentication failed. Please check your credentials.' });
    } else if (err.code === '3D000') {
      res.status(500).json({ error: 'Database does not exist. Please check your database name.' });
    } else if (err.code === '42P01') {
      res.status(500).json({ error: 'Table not found. Please check your database schema.' });
    } else {
      res.status(500).json({ 
        error: 'Database error occurred',
        details: err.message,
        code: err.code
      });
    }
  } finally {
    if (client) {
      client.release();
    }
    if (pool) {
      await pool.end();
    }
  }
}

async function handleGet(req, res, client) {
  const { id, analytics, programs, bookings } = req.query;
  
  if (id && bookings === 'true') {
    try {
      // Pagination params
      const pageSize = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 50, 200));
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const offset = (page - 1) * pageSize;

      // Count total
      const countResult = await client.query(`
        SELECT COUNT(*)::int AS total
        FROM bookings b
        WHERE b.sku IN (
          SELECT DISTINCT p.sku
          FROM products p
          WHERE p.supplier_id = $1
        )
      `, [id]);

      const total = countResult.rows[0]?.total || 0;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      // Get paged bookings for specific supplier
      const bookingsResult = await client.query(`
        SELECT 
          b.booking_number,
          b.sku,
          b.program,
          b.tour_date,
          b.book_date,
          b.customer_name,
          b.adult,
          b.child,
          b.net_total
        FROM bookings b
        WHERE b.sku IN (
          SELECT DISTINCT p.sku 
          FROM products p 
          WHERE p.supplier_id = $1
        )
        ORDER BY b.tour_date DESC, b.book_date DESC
        LIMIT $2 OFFSET $3
      `, [id, pageSize, offset]);
      
      return res.status(200).json({
        bookings: bookingsResult.rows,
        total,
        page,
        pageSize,
        totalPages
      });
    } catch (error) {
      console.error('Error fetching supplier bookings:', error);
      return res.status(500).json({ error: 'Database error: ' + error.message });
    }
  }
  
  if (id && programs === 'true') {
    try {
      // Get programs for specific supplier
      const programsResult = await client.query(`
        SELECT 
          p.sku,
          p.program as name,
          COUNT(DISTINCT b.booking_number) as bookings_count,
          COALESCE(SUM(COALESCE(b.net_total, 0)), 0) as total_net
        FROM products p
        LEFT JOIN bookings b ON p.sku = b.sku
        WHERE p.supplier_id = $1
        GROUP BY p.sku, p.program
        ORDER BY p.program
      `, [id]);
      
      // Get summary totals
      const summaryResult = await client.query(`
        SELECT 
          COUNT(DISTINCT p.sku) as total_programs,
          COUNT(DISTINCT b.booking_number) as total_bookings,
          COALESCE(SUM(COALESCE(b.net_total, 0)), 0) as total_net
        FROM products p
        LEFT JOIN bookings b ON p.sku = b.sku
        WHERE p.supplier_id = $1
      `, [id]);
      
      // DEBUG: Get raw data to investigate
      const debugResult = await client.query(`
        SELECT 
          'products' as table_name,
          p.id as product_id,
          p.sku,
          p.program,
          p.supplier_id
        FROM products p
        WHERE p.supplier_id = $1
        UNION ALL
        SELECT 
          'bookings' as table_name,
          NULL as product_id,
          b.sku,
          b.program,
          NULL as supplier_id
        FROM bookings b
        WHERE b.sku IN (
          SELECT DISTINCT p.sku 
          FROM products p 
          WHERE p.supplier_id = $1
        )
        ORDER BY table_name, sku
      `, [id]);
      
      return res.status(200).json({
        programs: programsResult.rows,
        total_programs: summaryResult.rows[0]?.total_programs || 0,
        total_bookings: summaryResult.rows[0]?.total_bookings || 0,
        total_net: summaryResult.rows[0]?.total_net || 0,
        debug: debugResult.rows
      });
    } catch (error) {
      console.error('Error fetching supplier programs:', error);
      return res.status(500).json({ error: 'Database error: ' + error.message });
    }
  }
  
  if (id) {
    // Get specific supplier
    const result = await client.query(
      'SELECT * FROM suppliers WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    
    return res.status(200).json(result.rows[0]);
  }
  
  if (analytics === 'true') {
    // Get suppliers analytics
    const analyticsResult = await client.query(`
      SELECT 
        COUNT(DISTINCT s.id) as suppliers_count,
        COUNT(DISTINCT p.sku) as programs_count,
        COALESCE(SUM(COALESCE(b.net_total, 0)), 0) as total_paid,
        COALESCE(SUM(
          CASE 
            WHEN b.tour_date >= DATE_TRUNC('month', CURRENT_DATE) 
            THEN COALESCE(b.net_total, 0)
            ELSE 0 
          END
        ), 0) as total_due
      FROM suppliers s
      LEFT JOIN products p ON s.id = p.supplier_id
      LEFT JOIN bookings b ON p.sku = b.sku
    `);
    
    return res.status(200).json(analyticsResult.rows[0]);
  }
  
  // Get all suppliers with their stats - SIMPLE VERSION
  const result = await client.query(`
    SELECT 
      s.id,
      s.name,
      s.created_at,
      COUNT(DISTINCT p.sku) as programs_count,
      COUNT(DISTINCT b.booking_number) as bookings_count,
      COALESCE(SUM(b.net_total), 0) as total_amount,
      COALESCE(SUM(
        CASE 
          WHEN b.tour_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
          AND b.tour_date < DATE_TRUNC('month', CURRENT_DATE)
          THEN b.net_total
          ELSE 0 
        END
      ), 0) as paid_last_month,
      COALESCE(SUM(
        CASE 
          WHEN b.tour_date >= DATE_TRUNC('month', CURRENT_DATE) 
          THEN b.net_total
          ELSE 0 
        END
      ), 0) as this_month_net
    FROM suppliers s
    LEFT JOIN products p ON s.id = p.supplier_id
    LEFT JOIN bookings b ON p.sku = b.sku
    GROUP BY s.id, s.name, s.created_at
    ORDER BY s.name
  `);
  
  res.status(200).json(result.rows);
}

async function handlePost(req, res, client) {
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  try {
    const result = await client.query(
      'INSERT INTO suppliers (name) VALUES ($1) RETURNING *',
      [name]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Supplier with this name already exists' });
    }
    throw err;
  }
}

async function handlePut(req, res, client) {
  const { id } = req.query;
  const { name } = req.body;
  
  if (!id || !name) {
    return res.status(400).json({ error: 'ID and name are required' });
  }
  
  try {
    const result = await client.query(
      'UPDATE suppliers SET name = $1 WHERE id = $2 RETURNING *',
      [name, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    
    res.status(200).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Supplier with this name already exists' });
    }
    throw err;
  }
} 