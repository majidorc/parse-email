import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    // Calculate last month date range
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDateParam = start.toISOString().split('T')[0];
    const endDateParam = end.toISOString().split('T')[0];
    
    console.log('Last month range:', startDateParam, 'to', endDateParam);
    
    // Get all Viator bookings for last month (Bokun channel except GYG bookings)
    const viatorBookings = await client.query(`
      SELECT 
        booking_number,
        channel,
        tour_date,
        book_date,
        paid,
        adult,
        child,
        infant,
        CASE
          WHEN channel = 'Bokun' AND booking_number NOT LIKE 'GYG%' THEN 'Viator'
          ELSE 'Other'
        END AS classified_channel
      FROM bookings
      WHERE tour_date >= $1 AND tour_date < $2
        AND channel = 'Bokun'
        AND booking_number NOT LIKE 'GYG%'
      ORDER BY tour_date DESC
    `, [startDateParam, endDateParam]);
    
    // Get Viator summary
    const viatorSummary = await client.query(`
      SELECT 
        COUNT(*) AS total_bookings,
        COALESCE(SUM(paid), 0) AS total_sales,
        COALESCE(SUM(adult), 0) AS total_adults,
        COALESCE(SUM(child), 0) AS total_children,
        COALESCE(SUM(infant), 0) AS total_infants
      FROM bookings
      WHERE tour_date >= $1 AND tour_date < $2
        AND channel = 'Bokun'
        AND booking_number NOT LIKE 'GYG%'
    `, [startDateParam, endDateParam]);
    
    // Get all bookings for last month for comparison
    const allBookings = await client.query(`
      SELECT 
        booking_number,
        channel,
        tour_date,
        paid,
        CASE
          WHEN channel = 'Bokun' AND booking_number NOT LIKE 'GYG%' THEN 'Viator'
          WHEN channel = 'Website' THEN 'Website'
          WHEN channel IS NULL THEN 'Website'
          ELSE 'Website'
        END AS classified_channel
      FROM bookings
      WHERE tour_date >= $1 AND tour_date < $2
        AND channel != 'GYG'
      ORDER BY tour_date DESC
    `, [startDateParam, endDateParam]);
    
    // Get total summary for last month
    const totalSummary = await client.query(`
      SELECT 
        COUNT(*) AS total_bookings,
        COALESCE(SUM(paid), 0) AS total_sales
      FROM bookings
      WHERE tour_date >= $1 AND tour_date < $2
        AND channel != 'GYG'
    `, [startDateParam, endDateParam]);
    
    // Get channel breakdown for last month
    const channelBreakdown = await client.query(`
      SELECT 
        CASE
          WHEN channel = 'Bokun' AND booking_number NOT LIKE 'GYG%' THEN 'Viator'
          WHEN channel = 'Website' THEN 'Website'
          WHEN channel IS NULL THEN 'Website'
          ELSE 'Website'
        END AS classified_channel,
        COUNT(*) AS bookings,
        COALESCE(SUM(paid), 0) AS sales
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
      ORDER BY sales DESC
    `, [startDateParam, endDateParam]);
    
    res.status(200).json({
      dateRange: {
        startDate: startDateParam,
        endDate: endDateParam,
        period: 'lastMonth'
      },
      viatorBookings: viatorBookings.rows,
      viatorSummary: viatorSummary.rows[0],
      allBookings: allBookings.rows,
      totalSummary: totalSummary.rows[0],
      channelBreakdown: channelBreakdown.rows
    });
    
  } catch (error) {
    console.error('Error in debug-viator-last-month:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
} 