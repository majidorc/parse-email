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
    
    
    // Also check for NULL channels
    const nullChannels = await client.query(`
      SELECT COUNT(*) as null_count 
      FROM bookings 
      WHERE channel IS NULL
    `);
    
    
    // Check a few sample bookings with their channel values
    const sampleBookings = await client.query(`
      SELECT booking_number, channel, tour_date 
      FROM bookings 
      ORDER BY tour_date DESC 
      LIMIT 5
    `);
    
    
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
        case 'twoMonthsAgo':
          start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
          end = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          break;
        case 'threeMonthsAgo':
          start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
          end = new Date(now.getFullYear(), now.getMonth() - 2, 1);
          break;
        case 'sixMonthsAgo':
          start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
          end = new Date(now.getFullYear(), now.getMonth() - 5, 1);
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
    
    // FIXED: Only 2 channels - Viator (bokun emails except GYG) and Website (info@tours.co.th + GYG)
    let salesByChannelResult;
    if (dateFilter) {
      salesByChannelResult = await client.query(`
        SELECT 
          CASE
            WHEN b.booking_number LIKE 'GYG%' THEN 'Website'
            WHEN p.sender ILIKE '%bokun.io%' THEN 'Viator'
            WHEN p.sender ILIKE '%info@tours.co.th%' THEN 'Website'
            ELSE 'Website'
          END AS channel,
          COUNT(*) AS bookings,
          COALESCE(SUM(b.paid), 0) AS total_sales,
          COALESCE(SUM(b.adult), 0) AS total_adults,
          COALESCE(SUM(b.child), 0) AS total_children,
          COALESCE(SUM(b.infant), 0) AS total_infants
        FROM bookings b
        LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
        WHERE b.tour_date >= $1 AND b.tour_date < $2
        GROUP BY 
          CASE
            WHEN b.booking_number LIKE 'GYG%' THEN 'Website'
            WHEN p.sender ILIKE '%bokun.io%' THEN 'Viator'
            WHEN p.sender ILIKE '%info@tours.co.th%' THEN 'Website'
            ELSE 'Website'
          END
        ORDER BY total_sales DESC
      `, [startDateParam, endDateParam]);
    } else {
      salesByChannelResult = await client.query(`
        SELECT 
          CASE
            WHEN b.booking_number LIKE 'GYG%' THEN 'Website'
            WHEN p.sender ILIKE '%bokun.io%' THEN 'Viator'
            WHEN p.sender ILIKE '%info@tours.co.th%' THEN 'Website'
            ELSE 'Website'
          END AS channel,
          COUNT(*) AS bookings,
          COALESCE(SUM(b.paid), 0) AS total_sales,
          COALESCE(SUM(b.adult), 0) AS total_adults,
          COALESCE(SUM(b.child), 0) AS total_children,
          COALESCE(SUM(b.infant), 0) AS total_infants
        FROM bookings b
        LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
        GROUP BY 
          CASE
            WHEN b.booking_number LIKE 'GYG%' THEN 'Website'
            WHEN p.sender ILIKE '%bokun.io%' THEN 'Viator'
            WHEN p.sender ILIKE '%info@tours.co.th%' THEN 'Website'
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
    
    // FIXED: Only 2 channels - Viator vs Website breakdown
    let viatorWebsiteResult;
    if (dateFilter) {
      viatorWebsiteResult = await client.query(`
        SELECT 
          CASE
            WHEN b.booking_number LIKE 'GYG%' THEN 'Website'
            WHEN p.sender ILIKE '%bokun.io%' THEN 'Viator'
            WHEN p.sender ILIKE '%info@tours.co.th%' THEN 'Website'
            ELSE 'Website'
          END AS type,
          COUNT(*) AS bookings,
          COALESCE(SUM(b.paid), 0) AS sales
        FROM bookings b
        LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
        WHERE b.tour_date >= $1 AND b.tour_date < $2
        GROUP BY 
          CASE
            WHEN b.booking_number LIKE 'GYG%' THEN 'Website'
            WHEN p.sender ILIKE '%bokun.io%' THEN 'Viator'
            WHEN p.sender ILIKE '%info@tours.co.th%' THEN 'Website'
            ELSE 'Website'
          END
      `, [startDateParam, endDateParam]);
    } else {
      viatorWebsiteResult = await client.query(`
        SELECT 
          CASE
            WHEN b.booking_number LIKE 'GYG%' THEN 'Website'
            WHEN p.sender ILIKE '%bokun.io%' THEN 'Viator'
            WHEN p.sender ILIKE '%info@tours.co.th%' THEN 'Website'
            ELSE 'Website'
          END AS type,
          COUNT(*) AS bookings,
          COALESCE(SUM(b.paid), 0) AS sales
        FROM bookings b
        LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
        GROUP BY 
          CASE
            WHEN b.booking_number LIKE 'GYG%' THEN 'Website'
            WHEN p.sender ILIKE '%bokun.io%' THEN 'Viator'
            WHEN p.sender ILIKE '%info@tours.co.th%' THEN 'Website'
            ELSE 'Website'
          END
      `);
    }
    
    // Calculate benefit using the same logic as accounting.js
    // Check if net_total column exists
    let hasNetTotalColumn = false;
    try {
      const { rows: columnCheck } = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' AND column_name = 'net_total'
      `);
      hasNetTotalColumn = columnCheck.length > 0;
    } catch (err) {
      hasNetTotalColumn = false;
    }

    // Calculate total benefit for the period
    let totalBenefitResult;
    if (dateFilter) {
      totalBenefitResult = await client.query(
        `SELECT 
          b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
         FROM bookings b
         LEFT JOIN products p ON b.sku = p.sku
         LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
         WHERE b.tour_date >= $1 AND b.tour_date < $2`,
        [startDateParam, endDateParam]
      );
    } else {
      totalBenefitResult = await client.query(
        `SELECT 
          b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
         FROM bookings b
         LEFT JOIN products p ON b.sku = p.sku
         LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))`
      );
    }
    
    const totalBenefit = totalBenefitResult.rows.reduce((sum, b) => {
      const netAdult = Number(b.net_adult) || 0;
      const netChild = Number(b.net_child) || 0;
      const adult = Number(b.adult) || 0;
      const child = Number(b.child) || 0;
      const paid = Number(b.paid) || 0;
      // Use stored net_total if available and column exists, otherwise calculate from rates
      const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
      return sum + (paid - netTotal);
    }, 0);

    // Calculate benefit by channel using the same logic as sales calculation
    let viatorBenefitResult;
    let websiteBenefitResult;
    
    if (dateFilter) {
      viatorBenefitResult = await client.query(
        `SELECT 
          b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
         FROM bookings b
         LEFT JOIN products p ON b.sku = p.sku
         LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
         LEFT JOIN parsed_emails pe ON b.booking_number = pe.booking_number
         WHERE b.tour_date >= $1 AND b.tour_date < $2
         AND (
           (pe.sender ILIKE '%bokun.io%')
         )`,
        [startDateParam, endDateParam]
      );
      
      websiteBenefitResult = await client.query(
        `SELECT 
          b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
         FROM bookings b
         LEFT JOIN products p ON b.sku = p.sku
         LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
         LEFT JOIN parsed_emails pe ON b.booking_number = pe.booking_number
         WHERE b.tour_date >= $1 AND b.tour_date < $2
         AND (
           (b.booking_number LIKE 'GYG%') OR
           (pe.sender ILIKE '%info@tours.co.th%') OR
           (pe.sender IS NULL AND b.booking_number NOT LIKE 'GYG%')
         )`,
        [startDateParam, endDateParam]
      );
    } else {
      viatorBenefitResult = await client.query(
        `SELECT 
          b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
         FROM bookings b
         LEFT JOIN products p ON b.sku = p.sku
         LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
         LEFT JOIN parsed_emails pe ON b.booking_number = pe.booking_number
         WHERE (
           (pe.sender ILIKE '%bokun.io%')
         )`
      );
      
      websiteBenefitResult = await client.query(
        `SELECT 
          b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
         FROM bookings b
         LEFT JOIN products p ON b.sku = p.sku
         LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
         LEFT JOIN parsed_emails pe ON b.booking_number = pe.booking_number
         WHERE (
           (b.booking_number LIKE 'GYG%') OR
           (pe.sender ILIKE '%info@tours.co.th%') OR
           (pe.sender IS NULL AND b.booking_number NOT LIKE 'GYG%')
         )`
      );
    }
    
    const viatorBenefit = viatorBenefitResult.rows.reduce((sum, b) => {
      const netAdult = Number(b.net_adult) || 0;
      const netChild = Number(b.net_child) || 0;
      const adult = Number(b.adult) || 0;
      const child = Number(b.child) || 0;
      const paid = Number(b.paid) || 0;
      const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
      return sum + (paid - netTotal);
    }, 0);
    
    const websiteBenefit = websiteBenefitResult.rows.reduce((sum, b) => {
      const netAdult = Number(b.net_adult) || 0;
      const netChild = Number(b.net_child) || 0;
      const adult = Number(b.adult) || 0;
      const child = Number(b.child) || 0;
      const paid = Number(b.paid) || 0;
      const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
      return sum + (paid - netTotal);
    }, 0);

    // Extract Viator and Website metrics
    const viatorData = viatorWebsiteResult.rows.find(row => row.type === 'Viator');
    const websiteData = viatorWebsiteResult.rows.find(row => row.type === 'Website');
    
    const viatorSale = viatorData ? parseFloat(viatorData.sales) : 0;
    const websiteSale = websiteData ? parseFloat(websiteData.sales) : 0;
    const viatorCount = viatorData ? parseInt(viatorData.bookings, 10) : 0;
    const websiteCount = websiteData ? parseInt(websiteData.bookings, 10) : 0;
    
    // Calculate passenger counts from salesByChannel data
    const viatorChannelData = salesByChannelResult.rows.find(row => row.channel === 'Viator');
    const websiteChannelData = salesByChannelResult.rows.find(row => row.channel === 'Website');
    
    const viatorPassengers = viatorChannelData ? 
      (parseInt(viatorChannelData.total_adults) || 0) + 
      (parseInt(viatorChannelData.total_children) || 0) + 
      (parseInt(viatorChannelData.total_infants) || 0) : 0;
    
    const websitePassengers = websiteChannelData ? 
      (parseInt(websiteChannelData.total_adults) || 0) + 
      (parseInt(websiteChannelData.total_children) || 0) + 
      (parseInt(websiteChannelData.total_infants) || 0) : 0;
    
    // Debug logging for passenger counts
    console.log('Debug - Available channels:', debugChannels.rows);
    console.log('Debug - NULL channels count:', nullChannels.rows[0].null_count);
    console.log('Debug - Sample bookings:', sampleBookings.rows);

    res.status(200).json({
      salesByChannel: salesByChannelResult.rows,
      totalSummary: totalSummaryResult.rows[0],
      salesByMonth: salesByMonthResult.rows,
      topPrograms: topProgramsResult.rows,
      viatorSale,
      websiteSale,
      viatorCount,
      websiteCount,
      viatorPassengers,
      websitePassengers,
      totalBenefit,
      viatorBenefit,
      websiteBenefit,
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