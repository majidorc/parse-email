import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    // Check table structure
    const tableStructure = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'bookings' 
      ORDER BY ordinal_position
    `);
    
    // Check sample data with all fields
    const sampleData = await client.query(`
      SELECT booking_number, channel, email, tour_date
      FROM bookings 
      WHERE channel IN ('Bokun', 'GYG', 'Website', 'Viator')
      ORDER BY tour_date DESC 
      LIMIT 10
    `);
    
    // Check GYG vs Bokun distinction
    const gygBokunCheck = await client.query(`
      SELECT channel, email, COUNT(*) as count
      FROM bookings 
      WHERE channel IN ('Bokun', 'GYG')
      GROUP BY channel, email
      ORDER BY count DESC
      LIMIT 10
    `);
    
    // Check Website emails
    const websiteEmails = await client.query(`
      SELECT channel, email, COUNT(*) as count
      FROM bookings 
      WHERE channel = 'Website'
      GROUP BY channel, email
      ORDER BY count DESC
      LIMIT 10
    `);
    
    res.status(200).json({
      tableStructure: tableStructure.rows,
      sampleData: sampleData.rows,
      gygBokunCheck: gygBokunCheck.rows,
      websiteEmails: websiteEmails.rows
    });
    
  } catch (err) {
    console.error('Debug error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
} 