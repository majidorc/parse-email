const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

module.exports = async function handler(req, res) {
  try {
    const { type, startDate, endDate, period, updateChannels } = req.query;
    
    // Route to appropriate analytics function based on type
    if (type === 'parsed-emails') {
      return handleParsedEmailsAnalytics(req, res);
    } else if (type === 'sales') {
      return handleSalesAnalytics(req, res);
    } else {
      // Default to parsed emails analytics for backward compatibility
      return handleParsedEmailsAnalytics(req, res);
    }
  } catch (err) {
    console.error('Analytics API error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Handle parsed emails analytics
async function handleParsedEmailsAnalytics(req, res) {
  try {
    // Bookings grouped by sender
    const { rows: bySenderResult } = await sql.query(
      `SELECT sender, COUNT(*) AS count FROM parsed_emails GROUP BY sender ORDER BY count DESC`
    );
    // Bookings grouped by seller (parsed from body and sender)
    const { rows: bySellerResult } = await sql.query(
      `SELECT
        CASE
          WHEN sender ILIKE '%info@tours.co.th%' THEN 'Website'
          WHEN sender ILIKE '%bokun.io%' THEN 'Viator'
          ELSE 'Website'
        END AS seller,
        COUNT(*) AS count
      FROM parsed_emails
      GROUP BY seller
      ORDER BY count DESC`
    );
    // Bookings grouped by source_email (inbox)
    const { rows: bySourceResult } = await sql.query(
      `SELECT COALESCE(source_email, 'Unknown') AS source_email, COUNT(*) AS count FROM parsed_emails GROUP BY source_email ORDER BY count DESC`
    );
    // Bookings grouped by channel (OTA, WebSite, etc)
    const { rows: byChannelResult } = await sql.query(
      `SELECT
        CASE
          WHEN sender ILIKE '%info@tours.co.th%' THEN 'Website'
          WHEN sender ILIKE '%bokun.io%' THEN 'Viator'
          ELSE 'Website'
        END AS channel,
        COUNT(*) AS count
      FROM parsed_emails
      GROUP BY channel
      ORDER BY count DESC`
    );
    // Total sale (sum of paid) and total bookings (count) from bookings table
    const { rows: totalResult } = await sql.query('SELECT COALESCE(SUM(paid),0) AS total_sale, COUNT(*) AS total_bookings FROM bookings');
    const totalSale = parseFloat(totalResult[0].total_sale);
    const totalBookings = parseInt(totalResult[0].total_bookings, 10);
    // Viator Sale (bokun emails except GYG)
    const { rows: viatorResult } = await sql.query(`
      SELECT COALESCE(SUM(b.paid),0) AS viator_sale, COUNT(*) AS viator_count 
      FROM bookings b
      LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
      WHERE p.sender ILIKE '%bokun.io%' AND b.booking_number NOT LIKE 'GYG%'
    `);
    const viatorSale = parseFloat(viatorResult[0].viator_sale);
    const viatorCount = parseInt(viatorResult[0].viator_count, 10);
    
    // Website Sale (info@tours.co.th + GYG bookings)
    const { rows: websiteResult } = await sql.query(`
      SELECT COALESCE(SUM(b.paid),0) AS website_sale, COUNT(*) AS website_count 
      FROM bookings b
      LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
      WHERE (p.sender ILIKE '%info@tours.co.th%' OR b.booking_number LIKE 'GYG%')
    `);
    const websiteSale = parseFloat(websiteResult[0].website_sale);
    const websiteCount = parseInt(websiteResult[0].website_count, 10);
    
    // NEW: Detailed breakdown by source_email (inbox) showing Viator vs Website
    const { rows: bySourceChannelResult } = await sql.query(
      `SELECT 
        COALESCE(source_email, 'Unknown') AS source_email,
        CASE
          WHEN sender ILIKE '%info@tours.co.th%' THEN 'Website'
          WHEN sender ILIKE '%bokun.io%' THEN 'Viator'
          ELSE 'Website'
        END AS channel,
        COUNT(*) AS count
      FROM parsed_emails
      GROUP BY source_email, channel
      ORDER BY source_email, count DESC`
    );
    
    res.status(200).json({
      bySender: bySenderResult,
      bySupplier: bySellerResult,
      bySource: bySourceResult,
      byChannel: byChannelResult,
      bySourceChannel: bySourceChannelResult, // NEW: detailed breakdown
      totalSale,
      totalBookings,
      viatorSale,
      viatorCount,
      websiteSale,
      websiteCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Handle sales analytics
async function handleSalesAnalytics(req, res) {
  try {
    const { startDate, endDate, period, updateChannels } = req.query;
    
    // Handle channel consolidation if requested
    if (updateChannels === 'true') {
      console.log('Starting channel consolidation...');
      
      const result = await sql.query(`
        UPDATE bookings b
        SET channel = 
          CASE 
            WHEN b.booking_number LIKE 'GYG%' THEN 'Website'
            WHEN pe.sender ILIKE '%bokun.io%' THEN 'Viator'
            WHEN pe.sender ILIKE '%info@tours.co.th%' THEN 'Website'
            ELSE 'Website'
          END
        FROM parsed_emails pe
        WHERE b.booking_number = pe.booking_number
      `);
      
      // Also update bookings that don't have parsed_emails records
      const result2 = await sql.query(`
        UPDATE bookings 
        SET channel = 'Website'
        WHERE booking_number NOT IN (SELECT booking_number FROM parsed_emails)
      `);
      
      console.log(`Updated ${result.rowCount} bookings`);
      
      // Verify the changes
      const { rows: verifyResult } = await sql.query(`
        SELECT channel, COUNT(*) as count 
        FROM bookings 
        GROUP BY channel 
        ORDER BY count DESC
      `);
      
      console.log('Current channel distribution:');
      verifyResult.forEach(row => {
        console.log(`  ${row.channel}: ${row.count}`);
      });
      
      return res.status(200).json({ 
        success: true, 
        updated: result.rowCount,
        channels: verifyResult 
      });
    }
    
    // Debug: Check what channel values exist in the database
    const { rows: debugChannels } = await sql.query(`
      SELECT DISTINCT channel, COUNT(*) as count 
      FROM bookings 
      GROUP BY channel 
      ORDER BY count DESC
    `);
    
    // Also check for NULL channels
    const { rows: nullChannels } = await sql.query(`
      SELECT COUNT(*) as null_count 
      FROM bookings 
      WHERE channel IS NULL
    `);
    
    // Check a few sample bookings with their channel values
    const { rows: sampleBookings } = await sql.query(`
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
        case 'nextWeek':
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 7);
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
        case 'nextMonth':
          start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          end = new Date(now.getFullYear(), now.getMonth() + 2, 1);
          break;
        case 'next2Months':
          start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          end = new Date(now.getFullYear(), now.getMonth() + 3, 1);
          break;
        case 'twoMonthsAgo':
          start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
          end = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          break;
        case 'threeMonthsAgo':
          start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
          end = new Date(now.getFullYear(), now.getMonth() - 2, 1);
          break;
        case 'next3Months':
          start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          end = new Date(now.getFullYear(), now.getMonth() + 4, 1);
          break;
        case 'sixMonthsAgo':
          start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
          end = new Date(now.getFullYear(), now.getMonth() - 5, 1);
          break;
        case 'next6Months':
          start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          end = new Date(now.getFullYear(), now.getMonth() + 7, 1);
          break;
        case 'nextYear':
          start = new Date(now.getFullYear() + 1, 0, 1);
          end = new Date(now.getFullYear() + 2, 0, 1);
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
      
      // If an unknown period was provided (not 'all'), default to thisMonth
      if (!start && !end && period && period !== 'all') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
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
    

    
    // FIXED: Only 2 channels - Viator (bokun emails except GYG) and Website (info@tours.co.th + GYG)
    let salesByChannelResult;
    if (dateFilter) {
      const { rows: result } = await sql.query(`
        SELECT 
          CASE
            WHEN b.booking_number LIKE 'GYG%' THEN 'Website'
            WHEN b.booking_number LIKE '1%' THEN 'Viator'
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
            WHEN b.booking_number LIKE '1%' THEN 'Viator'
            WHEN p.sender ILIKE '%info@tours.co.th%' THEN 'Website'
            ELSE 'Website'
          END
        ORDER BY total_sales DESC
      `, [startDateParam, endDateParam]);
      salesByChannelResult = result;
    } else {
      const { rows: result } = await sql.query(`
        SELECT 
          CASE
            WHEN b.booking_number LIKE 'GYG%' THEN 'Website'
            WHEN b.booking_number LIKE '1%' THEN 'Viator'
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
            WHEN b.booking_number LIKE '1%' THEN 'Viator'
            WHEN p.sender ILIKE '%info@tours.co.th%' THEN 'Website'
            ELSE 'Website'
          END
        ORDER BY total_sales DESC
      `);
      salesByChannelResult = result;
    }
    
    // Total summary for the period
    let totalSummaryResult;
    if (dateFilter) {
      const { rows: result } = await sql.query(`
        SELECT 
          COUNT(*) AS total_bookings,
          COALESCE(SUM(paid), 0) AS total_sales,
          COALESCE(SUM(adult), 0) AS total_adults,
          COALESCE(SUM(child), 0) AS total_children,
          COALESCE(SUM(infant), 0) AS total_infants
        FROM bookings
        WHERE tour_date >= $1 AND tour_date < $2
      `, [startDateParam, endDateParam]);
      totalSummaryResult = result;
    } else {
      const { rows: result } = await sql.query(`
        SELECT 
          COUNT(*) AS total_bookings,
          COALESCE(SUM(paid), 0) AS total_sales,
          COALESCE(SUM(adult), 0) AS total_adults,
          COALESCE(SUM(child), 0) AS total_children,
          COALESCE(SUM(infant), 0) AS total_infants
        FROM bookings
      `);
      totalSummaryResult = result;
    }
    
    // Sales by month (for chart)
    let salesByMonthResult;
    if (dateFilter) {
      const { rows: result } = await sql.query(`
        SELECT 
          DATE_TRUNC('month', tour_date) AS month,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        WHERE tour_date >= $1 AND tour_date < $2
        GROUP BY DATE_TRUNC('month', tour_date)
        ORDER BY month
      `, [startDateParam, endDateParam]);
      salesByMonthResult = result;
    } else {
      const { rows: result } = await sql.query(`
        SELECT 
          DATE_TRUNC('month', tour_date) AS month,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        GROUP BY DATE_TRUNC('month', tour_date)
        ORDER BY month
      `);
      salesByMonthResult = result;
    }
    
    // Top programs by sales
    let topProgramsResult;
    let topProgramsComparison = null;
    if (dateFilter) {
      const { rows: result } = await sql.query(`
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
      topProgramsResult = result;
    } else {
      const { rows: result } = await sql.query(`
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
      topProgramsResult = result;
    }
    
    // FIXED: Only 2 channels - Viator vs Website breakdown
    let viatorWebsiteResult;
    if (dateFilter) {
      const { rows: result } = await sql.query(`
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
      viatorWebsiteResult = result;
    } else {
      const { rows: result } = await sql.query(`
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
      viatorWebsiteResult = result;
    }
    
    // Calculate benefit using the same logic as accounting.js
    let hasNetTotalColumn = false;
    try {
      const { rows: columnCheck } = await sql.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' AND column_name = 'net_total'
      `);
      hasNetTotalColumn = columnCheck.length > 0;
    } catch (err) {
      hasNetTotalColumn = false;
    }

    // Calculate number of days in the period
    let periodDays = 1;
    if (startDateParam && endDateParam) {
      const startDate = new Date(startDateParam);
      const endDate = new Date(endDateParam);
      const diffTime = Math.abs(endDate - startDate);
      periodDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    
    // Calculate total benefit for the period
    let totalBenefitResult;
    if (dateFilter) {
      const { rows: result } = await sql.query(
        `SELECT 
          b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
         FROM bookings b
         LEFT JOIN products p ON b.sku = p.sku
         LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
         WHERE b.tour_date >= $1 AND b.tour_date < $2`,
        [startDateParam, endDateParam]
      );
      totalBenefitResult = result;
    } else {
      const { rows: result } = await sql.query(
        `SELECT 
          b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
         FROM bookings b
         LEFT JOIN products p ON b.sku = p.sku
         LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))`
      );
      totalBenefitResult = result;
    }
    
    const totalBenefit = totalBenefitResult.reduce((sum, b) => {
      const netAdult = Number(b.net_adult) || 0;
      const netChild = Number(b.net_child) || 0;
      const adult = Number(b.adult) || 0;
      const child = Number(b.child) || 0;
      const paid = Number(b.paid) || 0;
      const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
      return sum + (paid - netTotal);
    }, 0);

    // Calculate benefit by channel
    let viatorBenefitResult;
    let websiteBenefitResult;
    
    if (dateFilter) {
      const { rows: result } = await sql.query(
        `SELECT 
          b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
         FROM bookings b
         LEFT JOIN products p ON b.sku = p.sku
         LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
         LEFT JOIN parsed_emails pe ON b.booking_number = pe.booking_number
         WHERE b.tour_date >= $1 AND b.tour_date < $2
         AND pe.sender ILIKE '%bokun.io%'
         AND b.booking_number NOT LIKE 'GYG%'`,
        [startDateParam, endDateParam]
      );
      viatorBenefitResult = result;
      
      const { rows: result2 } = await sql.query(
        `SELECT 
          b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
         FROM bookings b
         LEFT JOIN products p ON b.sku = p.sku
         LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
         LEFT JOIN parsed_emails pe ON b.booking_number = pe.booking_number
         WHERE b.tour_date >= $1 AND b.tour_date < $2
         AND (
           b.booking_number LIKE 'GYG%' OR
           pe.sender ILIKE '%info@tours.co.th%' OR
           (pe.sender IS NULL AND b.booking_number NOT LIKE 'GYG%')
         )`,
        [startDateParam, endDateParam]
      );
      websiteBenefitResult = result2;
    } else {
      const { rows: result } = await sql.query(
        `SELECT 
          b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
         FROM bookings b
         LEFT JOIN products p ON b.sku = p.sku
         LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
         LEFT JOIN parsed_emails pe ON b.booking_number = pe.booking_number
         WHERE pe.sender ILIKE '%bokun.io%'
         AND b.booking_number NOT LIKE 'GYG%'`
      );
      viatorBenefitResult = result;
      
      const { rows: result2 } = await sql.query(
        `SELECT 
          b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
         FROM bookings b
         LEFT JOIN products p ON b.sku = p.sku
         LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
         LEFT JOIN parsed_emails pe ON b.booking_number = pe.booking_number
         WHERE (
           b.booking_number LIKE 'GYG%' OR
           pe.sender ILIKE '%info@tours.co.th%' OR
           (pe.sender IS NULL AND b.booking_number NOT LIKE 'GYG%')
         )`
      );
      websiteBenefitResult = result2;
    }
    
    const viatorBenefit = viatorBenefitResult.reduce((sum, b) => {
      const netAdult = Number(b.net_adult) || 0;
      const netChild = Number(b.net_child) || 0;
      const adult = Number(b.adult) || 0;
      const child = Number(b.child) || 0;
      const paid = Number(b.paid) || 0;
      const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
      return sum + (paid - netTotal);
    }, 0);
    
    const websiteBenefit = websiteBenefitResult.reduce((sum, b) => {
      const netAdult = Number(b.net_adult) || 0;
      const netChild = Number(b.net_child) || 0;
      const adult = Number(b.adult) || 0;
      const child = Number(b.child) || 0;
      const paid = Number(b.paid) || 0;
      const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
      return sum + (paid - netTotal);
    }, 0);

    // Extract Viator and Website metrics
    const viatorData = viatorWebsiteResult.find(row => row.type === 'Viator');
    const websiteData = viatorWebsiteResult.find(row => row.type === 'Website');
    
    const viatorSale = viatorData ? parseFloat(viatorData.sales) : 0;
    const websiteSale = websiteData ? parseFloat(websiteData.sales) : 0;
    const viatorCount = viatorData ? parseInt(viatorData.bookings, 10) : 0;
    const websiteCount = websiteData ? parseInt(websiteData.bookings, 10) : 0;
    
    // Calculate passenger counts from salesByChannel data
    const viatorChannelData = salesByChannelResult.find(row => row.channel === 'Viator');
    const websiteChannelData = salesByChannelResult.find(row => row.channel === 'Website');
    
    const viatorPassengers = viatorChannelData ? 
      (parseInt(viatorChannelData.total_adults) || 0) + 
      (parseInt(viatorChannelData.total_children) || 0) + 
      (parseInt(viatorChannelData.total_infants) || 0) : 0;
    
    const websitePassengers = websiteChannelData ? 
      (parseInt(websiteChannelData.total_adults) || 0) + 
      (parseInt(websiteChannelData.total_children) || 0) + 
      (parseInt(websiteChannelData.total_infants) || 0) : 0;




    
    res.status(200).json({
      salesByChannel: salesByChannelResult,
      totalSummary: totalSummaryResult[0],
      salesByMonth: salesByMonthResult,
      topPrograms: topProgramsResult,
      viatorSale,
      websiteSale,
      viatorCount,
      websiteCount,
      viatorPassengers,
      websitePassengers,
      totalBenefit,
      viatorBenefit,
      websiteBenefit,
      periodDays,

      debug: {
        availableChannels: debugChannels,
        nullChannelsCount: nullChannels[0].null_count,
        sampleBookings: sampleBookings
      }
    });
    
  } catch (err) {
    console.error('Sales analytics error:', err);
    res.status(500).json({ error: err.message });
  }
}
