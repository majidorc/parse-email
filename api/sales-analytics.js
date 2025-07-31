import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    const { startDate, endDate, period } = req.query;
    
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
    
    // Sales by channel based on "Sold by" field only
    let salesByChannelResult;
    if (dateFilter) {
      salesByChannelResult = await client.query(`
        SELECT 
          CASE
            WHEN sold_by ILIKE '%viator.com%' THEN 'VIATOR'
            WHEN sold_by ILIKE '%getyourguide%' OR sold_by ILIKE '%no-reply@bokun.io%' THEN 'GYG'
            WHEN sold_by ILIKE '%info@tours.co.th%' THEN 'WebSite'
            ELSE 'Other'
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
            WHEN sold_by ILIKE '%viator.com%' THEN 'VIATOR'
            WHEN sold_by ILIKE '%getyourguide%' OR sold_by ILIKE '%no-reply@bokun.io%' THEN 'GYG'
            WHEN sold_by ILIKE '%info@tours.co.th%' THEN 'WebSite'
            ELSE 'Other'
          END
        ORDER BY total_sales DESC
      `, [startDateParam, endDateParam]);
    } else {
      salesByChannelResult = await client.query(`
        SELECT 
          CASE
            WHEN sold_by ILIKE '%viator.com%' THEN 'VIATOR'
            WHEN sold_by ILIKE '%getyourguide%' OR sold_by ILIKE '%no-reply@bokun.io%' THEN 'GYG'
            WHEN sold_by ILIKE '%info@tours.co.th%' THEN 'WebSite'
            ELSE 'Other'
          END AS channel,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS total_sales,
          COALESCE(SUM(adult), 0) AS total_adults,
          COALESCE(SUM(child), 0) AS total_children,
          COALESCE(SUM(infant), 0) AS total_infants
        FROM bookings
        GROUP BY 
          CASE
            WHEN sold_by ILIKE '%viator.com%' THEN 'VIATOR'
            WHEN sold_by ILIKE '%getyourguide%' OR sold_by ILIKE '%no-reply@bokun.io%' THEN 'GYG'
            WHEN sold_by ILIKE '%info@tours.co.th%' THEN 'WebSite'
            ELSE 'Other'
          END
        ORDER BY total_sales DESC
      `);
    }
    
    // Total summary for the period
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
    
    // Sales by month (for chart)
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
    
    // Top programs by sales
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
    
    // OTA vs Website breakdown based on "Sold by" field
    let otaWebsiteResult;
    if (dateFilter) {
      otaWebsiteResult = await client.query(`
        SELECT 
          CASE
            WHEN sold_by ILIKE '%info@tours.co.th%' THEN 'Website'
            ELSE 'OTA'
          END AS type,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        WHERE tour_date >= $1 AND tour_date < $2
        GROUP BY 
          CASE
            WHEN sold_by ILIKE '%info@tours.co.th%' THEN 'Website'
            ELSE 'OTA'
          END
      `, [startDateParam, endDateParam]);
    } else {
      otaWebsiteResult = await client.query(`
        SELECT 
          CASE
            WHEN sold_by ILIKE '%info@tours.co.th%' THEN 'Website'
            ELSE 'OTA'
          END AS type,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        GROUP BY 
          CASE
            WHEN sold_by ILIKE '%info@tours.co.th%' THEN 'Website'
            ELSE 'OTA'
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
      websiteCount
    });
    
  } catch (err) {
    console.error('Sales analytics error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
} 