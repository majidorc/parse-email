import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    // Calculate "this week" date range (same as analytics)
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startDateParam = start.toISOString().split('T')[0];
    const endDateParam = end.toISOString().split('T')[0];
    
    console.log('This week date range:', { startDateParam, endDateParam });
    
    // Get all bookings for this week
    const allBookings = await client.query(`
      SELECT booking_number, channel, tour_date, book_date
      FROM bookings
      WHERE tour_date >= $1 AND tour_date < $2
      ORDER BY tour_date DESC
    `, [startDateParam, endDateParam]);
    
    // Get bookings with our channel classification
    const classifiedBookings = await client.query(`
      SELECT 
        booking_number,
        channel,
        tour_date,
        CASE
          WHEN channel = 'Bokun' AND booking_number NOT LIKE 'GYG%' THEN 'Viator'
          WHEN channel = 'Website' THEN 'Website'
          WHEN channel = 'GYG' AND booking_number LIKE 'GYG%' THEN 'Website'
          WHEN channel IS NULL THEN 'Website'
          ELSE 'Website'
        END AS classified_channel
      FROM bookings
      WHERE tour_date >= $1 AND tour_date < $2
      ORDER BY tour_date DESC
    `, [startDateParam, endDateParam]);
    
    // Count by channel
    const channelCounts = await client.query(`
      SELECT 
        channel,
        COUNT(*) as count
      FROM bookings
      WHERE tour_date >= $1 AND tour_date < $2
      GROUP BY channel
      ORDER BY count DESC
    `, [startDateParam, endDateParam]);
    
    // Count by classified channel
    const classifiedCounts = await client.query(`
      SELECT 
        CASE
          WHEN channel = 'Bokun' AND booking_number NOT LIKE 'GYG%' THEN 'Viator'
          WHEN channel = 'Website' THEN 'Website'
          WHEN channel = 'GYG' AND booking_number LIKE 'GYG%' THEN 'Website'
          WHEN channel IS NULL THEN 'Website'
          ELSE 'Website'
        END AS classified_channel,
        COUNT(*) as count
      FROM bookings
      WHERE tour_date >= $1 AND tour_date < $2
      GROUP BY 
        CASE
          WHEN channel = 'Bokun' AND booking_number NOT LIKE 'GYG%' THEN 'Viator'
          WHEN channel = 'Website' THEN 'Website'
          WHEN channel = 'GYG' AND booking_number LIKE 'GYG%' THEN 'Website'
          WHEN channel IS NULL THEN 'Website'
          ELSE 'Website'
        END
      ORDER BY count DESC
    `, [startDateParam, endDateParam]);
    
    res.status(200).json({
      dateRange: { startDateParam, endDateParam },
      totalBookings: allBookings.rows.length,
      allBookings: allBookings.rows,
      classifiedBookings: classifiedBookings.rows,
      channelCounts: channelCounts.rows,
      classifiedCounts: classifiedCounts.rows
    });
    
  } catch (err) {
    console.error('Debug error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
} 