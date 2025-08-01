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
    
    // Test 1: All bookings (no filters)
    const allBookings = await client.query(`
      SELECT booking_number, channel, tour_date
      FROM bookings
      WHERE tour_date >= $1 AND tour_date < $2
      ORDER BY tour_date DESC
    `, [startDateParam, endDateParam]);
    
    // Test 2: Exclude GYG only
    const excludeGYG = await client.query(`
      SELECT booking_number, channel, tour_date
      FROM bookings
      WHERE tour_date >= $1 AND tour_date < $2
        AND channel != 'GYG'
      ORDER BY tour_date DESC
    `, [startDateParam, endDateParam]);
    
    // Test 3: Exclude GYG and OTA
    const excludeGYGAndOTA = await client.query(`
      SELECT booking_number, channel, tour_date
      FROM bookings
      WHERE tour_date >= $1 AND tour_date < $2
        AND channel NOT IN ('GYG', 'OTA')
      ORDER BY tour_date DESC
    `, [startDateParam, endDateParam]);
    
    // Test 4: Only Website and Bokun
    const onlyWebsiteAndBokun = await client.query(`
      SELECT booking_number, channel, tour_date
      FROM bookings
      WHERE tour_date >= $1 AND tour_date < $2
        AND channel IN ('Website', 'Bokun')
      ORDER BY tour_date DESC
    `, [startDateParam, endDateParam]);
    
    // Test 5: Current analytics logic
    const currentAnalytics = await client.query(`
      SELECT 
        CASE
          WHEN channel = 'Bokun' AND booking_number NOT LIKE 'GYG%' THEN 'Viator'
          WHEN channel = 'Website' THEN 'Website'
          WHEN channel IS NULL THEN 'Website'
          ELSE 'Website'
        END AS classified_channel,
        COUNT(*) as count
      FROM bookings
      WHERE tour_date >= $1 AND tour_date < $2
        AND channel != 'GYG'
      GROUP BY 
        CASE
          WHEN channel = 'Bokun' AND booking_number NOT LIKE 'GYG%' THEN 'Viator'
          WHEN channel = 'Website' THEN 'Website'
          WHEN channel IS NULL THEN 'Website'
          ELSE 'Website'
        END
      ORDER BY count DESC
    `, [startDateParam, endDateParam]);
    
    // Channel breakdown
    const channelBreakdown = await client.query(`
      SELECT channel, COUNT(*) as count
      FROM bookings
      WHERE tour_date >= $1 AND tour_date < $2
      GROUP BY channel
      ORDER BY count DESC
    `, [startDateParam, endDateParam]);
    
    res.status(200).json({
      dateRange: { startDateParam, endDateParam },
      allBookings: {
        count: allBookings.rows.length,
        bookings: allBookings.rows
      },
      excludeGYG: {
        count: excludeGYG.rows.length,
        bookings: excludeGYG.rows
      },
      excludeGYGAndOTA: {
        count: excludeGYGAndOTA.rows.length,
        bookings: excludeGYGAndOTA.rows
      },
      onlyWebsiteAndBokun: {
        count: onlyWebsiteAndBokun.rows.length,
        bookings: onlyWebsiteAndBokun.rows
      },
      currentAnalytics: currentAnalytics.rows,
      channelBreakdown: channelBreakdown.rows
    });
    
  } catch (err) {
    console.error('Debug error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
} 