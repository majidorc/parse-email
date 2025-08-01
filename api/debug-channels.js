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
    
    // Check sample data with available fields
    const sampleData = await client.query(`
      SELECT booking_number, channel, tour_date
      FROM bookings 
      WHERE channel IN ('Bokun', 'GYG', 'Website', 'Viator')
      ORDER BY tour_date DESC 
      LIMIT 10
    `);
    
    // Check channel distribution
    const channelDistribution = await client.query(`
      SELECT channel, COUNT(*) as count
      FROM bookings 
      GROUP BY channel
      ORDER BY count DESC
    `);
    
    // Check GYG vs Bokun distinction
    const gygBokunCheck = await client.query(`
      SELECT channel, COUNT(*) as count
      FROM bookings 
      WHERE channel IN ('Bokun', 'GYG')
      GROUP BY channel
      ORDER BY count DESC
    `);
    
    // Check Website data
    const websiteData = await client.query(`
      SELECT channel, COUNT(*) as count
      FROM bookings 
      WHERE channel = 'Website'
      GROUP BY channel
    `);
    
    res.status(200).json({
      tableStructure: tableStructure.rows,
      sampleData: sampleData.rows,
      channelDistribution: channelDistribution.rows,
      gygBokunCheck: gygBokunCheck.rows,
      websiteData: websiteData.rows
    });
    
  } catch (err) {
    console.error('Debug error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
} 