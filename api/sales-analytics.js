import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    const { startDate, endDate, period } = req.query;
    
    // Debug: Check what channel values exist in the database
    const debugChannels = await client.query(`
      SELECT DISTINCT channel, COUNT(*) as count 
      FROM bookings 
      GROUP BY channel 
      ORDER BY count DESC
    `);
    console.log('Debug - Available channels:', debugChannels.rows);
    
    // Also check for NULL channels
    const nullChannels = await client.query(`
      SELECT COUNT(*) as null_count 
      FROM bookings 
      WHERE channel IS NULL
    `);
    console.log('Debug - NULL channels count:', nullChannels.rows[0]);
    
    // Check a few sample bookings with their channel values
    const sampleBookings = await client.query(`
      SELECT booking_number, channel, tour_date 
      FROM bookings 
      ORDER BY tour_date DESC 
      LIMIT 5
    `);
    console.log('Debug - Sample bookings with channels:', sampleBookings.rows);
    
    let dateFilter = '';
    let startDateParam = null;
    let endDateParam = null;
    
    // Handle different period filters
    if (period) {
      const now = new Date();
      let start, end;
      
      switch (period) {
        case 'thisWeek':
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
          end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case 'lastWeek':
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 7);
          end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case 'thisMonth':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          break;
        case 'lastMonth':
          start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          end = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'thisYear':
          start = new Date(now.getFullYear(), 0, 1);
          end = new Date(now.getFullYear() + 1, 0, 1);
          break;
        case 'lastYear':
          start = new Date(now.getFullYear() - 1, 0, 1);
          end = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          // No date filter for 'all' or invalid period
          break;
      }
      
      if (start && end) {
        dateFilter = 'WHERE tour_date >= $1 AND tour_date < $2';
        startDateParam = start.toISOString().split('T')[0];
        endDateParam = end.toISOString().split('T')[0];
      }
    } else if (startDate && endDate) {
      dateFilter = 'WHERE tour_date >= $1 AND tour_date <= $2';
      startDateParam = startDate;
      endDateParam = endDate;
    }
    
    // No cancelled/deleted filters needed - cancelled bookings are completely removed from DB
    
    // Sales by channel based on channel field - FIXED LOGIC
    let salesByChannelResult;
    if (dateFilter) {
      salesByChannelResult = await client.query(`
        SELECT 
          CASE
            WHEN channel = 'Viator' THEN 'Viator'
            WHEN channel IN ('GYG', 'Website', 'Bokun', 'tours.co.th', 'OTA') THEN 'Website'
            WHEN channel IS NULL THEN 'Website'
            ELSE 'Website'
          END AS channel,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS total_sales,
          COALESCE(SUM(adult), 0) AS total_adults,
          COALESCE(SUM(child), 0) AS total_children,
          COALESCE(SUM(infant), 0) AS total_infants
        FROM bookings
        WHERE tour_date >= $1 AND tour_date < $2
        GROUP BY 
          CASE
            WHEN channel = 'Viator' THEN 'Viator'
            WHEN channel IN ('GYG', 'Website', 'Bokun', 'tours.co.th', 'OTA') THEN 'Website'
            WHEN channel IS NULL THEN 'Website'
            ELSE 'Website'
          END
        ORDER BY total_sales DESC
      `, [startDateParam, endDateParam]);
    } else {
      salesByChannelResult = await client.query(`
        SELECT 
          CASE
            WHEN channel = 'Viator' THEN 'Viator'
            WHEN channel = 'OTA' THEN 'OTA'
            WHEN channel IN ('GYG', 'Website', 'Bokun', 'tours.co.th') THEN 'Website'
            WHEN channel IS NULL THEN 'Website'
            ELSE 'Website'
          END AS channel,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS total_sales,
          COALESCE(SUM(adult), 0) AS total_adults,
          COALESCE(SUM(child), 0) AS total_children,
          COALESCE(SUM(infant), 0) AS total_infants
        FROM bookings
        GROUP BY 
          CASE
            WHEN channel = 'Viator' THEN 'Viator'
            WHEN channel = 'OTA' THEN 'OTA'
            WHEN channel IN ('GYG', 'Website', 'Bokun', 'tours.co.th') THEN 'Website'
            WHEN channel IS NULL THEN 'Website'
            ELSE 'Website'
          END
        ORDER BY total_sales DESC
      `);
    }
    
    // Total summary for the period - ADDED CANCELLED FILTER
    let totalSummaryResult;
    if (dateFilter) {
      totalSummaryResult = await client.query(`
        SELECT 
          COUNT(*) AS total_bookings,
          COALESCE(SUM(paid), 0) AS total_sales,
          COALESCE(SUM(adult), 0) AS total_adults,
          COALESCE(SUM(child), 0) AS total_children,
          COALESCE(SUM(infant), 0) AS total_infants
        FROM bookings
        WHERE tour_date >= $1 AND tour_date < $2
      `, [startDateParam, endDateParam]);
    } else {
      totalSummaryResult = await client.query(`
        SELECT 
          COUNT(*) AS total_bookings,
          COALESCE(SUM(paid), 0) AS total_sales,
          COALESCE(SUM(adult), 0) AS total_adults,
          COALESCE(SUM(child), 0) AS total_children,
          COALESCE(SUM(infant), 0) AS total_infants
        FROM bookings
      `);
    }
    
    // Sales by month (for chart) - ADDED CANCELLED FILTER
    let salesByMonthResult;
    if (dateFilter) {
      salesByMonthResult = await client.query(`
        SELECT 
          DATE_TRUNC('month', tour_date) AS month,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        WHERE tour_date >= $1 AND tour_date < $2
        GROUP BY DATE_TRUNC('month', tour_date)
        ORDER BY month
      `, [startDateParam, endDateParam]);
    } else {
      salesByMonthResult = await client.query(`
        SELECT 
          DATE_TRUNC('month', tour_date) AS month,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        GROUP BY DATE_TRUNC('month', tour_date)
        ORDER BY month
      `);
    }
    
    // Top programs by sales - ADDED CANCELLED FILTER
    let topProgramsResult;
    if (dateFilter) {
      topProgramsResult = await client.query(`
        SELECT 
          program,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        WHERE tour_date >= $1 AND tour_date < $2
          AND program IS NOT NULL AND program != ''
        GROUP BY program
        ORDER BY sales DESC
        LIMIT 10
      `, [startDateParam, endDateParam]);
    } else {
      topProgramsResult = await client.query(`
        SELECT 
          program,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        WHERE program IS NOT NULL AND program != ''
        GROUP BY program
        ORDER BY sales DESC
        LIMIT 10
      `);
    }
    
    // OTA vs Website breakdown based on channel field - FIXED LOGIC
    let otaWebsiteResult;
    if (dateFilter) {
      otaWebsiteResult = await client.query(`
        SELECT 
          CASE
            WHEN channel = 'Viator' THEN 'OTA'
            ELSE 'Website'
          END AS type,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        WHERE tour_date >= $1 AND tour_date < $2
        GROUP BY 
          CASE
            WHEN channel = 'Viator' THEN 'OTA'
            ELSE 'Website'
          END
      `, [startDateParam, endDateParam]);
    } else {
      otaWebsiteResult = await client.query(`
        SELECT 
          CASE
            WHEN channel = 'Viator' THEN 'OTA'
            ELSE 'Website'
          END AS type,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        GROUP BY 
          CASE
            WHEN channel = 'Viator' THEN 'OTA'
            ELSE 'Website'
          END
      `);
    }
    
    // Extract OTA and Website metrics
    const otaData = otaWebsiteResult.rows.find(row => row.type === 'OTA');
    const websiteData = otaWebsiteResult.rows.find(row => row.type === 'Website');
    
    const otaSale = otaData ? parseFloat(otaData.sales) : 0;
    const websiteSale = websiteData ? parseFloat(websiteData.sales) : 0;
    const otaCount = otaData ? parseInt(otaData.bookings, 10) : 0;
    const websiteCount = websiteData ? parseInt(websiteData.bookings, 10) : 0;
    
    // Debug logging for passenger counts
    console.log('Debug - Total Summary:', {
      total_bookings: totalSummaryResult.rows[0].total_bookings,
      total_adults: totalSummaryResult.rows[0].total_adults,
      total_children: totalSummaryResult.rows[0].total_children,
      total_infants: totalSummaryResult.rows[0].total_infants,
      period: period,
      startDate: startDateParam,
      endDate: endDateParam
    });

    res.status(200).json({
      salesByChannel: salesByChannelResult.rows,
      totalSummary: totalSummaryResult.rows[0],
      salesByMonth: salesByMonthResult.rows,
      topPrograms: topProgramsResult.rows,
      otaSale,
      websiteSale,
      otaCount,
      websiteCount,
      // Include debug data in response
      debug: {
        availableChannels: debugChannels.rows,
        nullChannelsCount: nullChannels.rows[0].null_count,
        sampleBookings: sampleBookings.rows
      }
    });
    
  } catch (err) {
    console.error('Sales analytics error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
} 