import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    // Test basic connection
    const testQuery = await client.query('SELECT 1 as test');
    console.log('Database connection test:', testQuery.rows);
    
    // Test if bookings table exists and has data
    const tableTest = await client.query(`
      SELECT COUNT(*) as total_bookings 
      FROM bookings 
      LIMIT 1
    `);
    console.log('Bookings table test:', tableTest.rows);
    
    // Test if cancelled and deleted columns exist
    const columnTest = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'bookings' 
      AND column_name IN ('cancelled', 'deleted')
    `);
    console.log('Column test:', columnTest.rows);
    
    // Test a simple query with the cancelled filter
    const filterTest = await client.query(`
      SELECT COUNT(*) as filtered_count
      FROM bookings
      WHERE (cancelled IS NULL OR cancelled = false)
        AND (deleted IS NULL OR deleted = false)
    `);
    console.log('Filter test:', filterTest.rows);
    
    res.status(200).json({
      success: true,
      connection: testQuery.rows[0],
      totalBookings: tableTest.rows[0],
      availableColumns: columnTest.rows,
      filteredCount: filterTest.rows[0]
    });
    
  } catch (err) {
    console.error('Test error:', err);
    res.status(500).json({ 
      error: err.message,
      stack: err.stack 
    });
  } finally {
    client.release();
  }
} 