import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
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
      case 'DELETE':
        await handleDelete(req, res, client);
        break;
      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (err) {
    console.error('Suppliers API error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}

async function handleGet(req, res, client) {
  const { id, analytics } = req.query;
  
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
        COUNT(DISTINCT p.id) as programs_count,
        COALESCE(SUM(b.paid - COALESCE(b.net_total, 0)), 0) as total_paid,
        COALESCE(SUM(
          CASE 
            WHEN b.book_date >= DATE_TRUNC('month', CURRENT_DATE) 
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
  
  // Get all suppliers with their stats
  const result = await client.query(`
    SELECT 
      s.id,
      s.name,
      s.created_at,
      COUNT(DISTINCT p.id) as programs_count,
      COUNT(DISTINCT b.booking_number) as bookings_count,
      COALESCE(SUM(b.paid), 0) as total_amount,
      COALESCE(SUM(
        CASE 
          WHEN b.book_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
          AND b.book_date < DATE_TRUNC('month', CURRENT_DATE)
          THEN b.paid - COALESCE(b.net_total, 0)
          ELSE 0 
        END
      ), 0) as paid_last_month,
      COALESCE(SUM(
        CASE 
          WHEN b.book_date >= DATE_TRUNC('month', CURRENT_DATE) 
          THEN COALESCE(b.net_total, 0)
          ELSE 0 
        END
      ), 0) as due_this_month
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

async function handleDelete(req, res, client) {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }
  
  const result = await client.query(
    'DELETE FROM suppliers WHERE id = $1 RETURNING *',
    [id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Supplier not found' });
  }
  
  res.status(200).json({ message: 'Supplier deleted successfully' });
} 