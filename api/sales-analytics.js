const { sql } = require('@vercel/postgres');

module.exports = async function handler(req, res) {
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
    
    // No cancelled/deleted filters needed - cancelled bookings are completely removed from DB
    
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
            WHEN p.sender ILIKE '%bokun.io%' THEN 'Viator'
            ELSE 'Website'
          END
        ORDER BY total_sales DESC
      `);
      salesByChannelResult = result;
    }
    
    // Total summary for the period - ADDED CANCELLED FILTER
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
        WHERE tour_date >= $1 AND b.tour_date < $2
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
    
    // Sales by month (for chart) - ADDED CANCELLED FILTER
    let salesByMonthResult;
    if (dateFilter) {
      const { rows: result } = await sql.query(`
        SELECT 
          DATE_TRUNC('month', tour_date) AS month,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        WHERE tour_date >= $1 AND b.tour_date < $2
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
    
    // Top programs by sales - ADDED CANCELLED FILTER
    let topProgramsResult;
    // Will hold comparison for top programs when a date filter is active
    let topProgramsComparison = null;
    if (dateFilter) {
      const { rows: result } = await sql.query(`
        SELECT 
          program,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        WHERE tour_date >= $1 AND b.tour_date < $2
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
        WHERE b.tour_date >= $1 AND tour_date < $2
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
    // Check if net_total column exists
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
      // Use stored net_total if available and column exists, otherwise calculate from rates
      const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
      return sum + (paid - netTotal);
    }, 0);

    // Debug: Calculate benefit by channel using the channel field to see if it matches our parsed_emails logic
    let channelBasedViatorBenefit = 0;
    let channelBasedWebsiteBenefit = 0;
    
    if (dateFilter) {
             const { rows: channelViatorResult } = await sql.query(
         `SELECT 
           b.booking_number, b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}, b.channel
          FROM bookings b
          LEFT JOIN products p ON b.sku = p.sku
          LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
          WHERE b.tour_date >= $1 AND b.tour_date < $2 AND b.channel = 'Viator'`,
         [startDateParam, endDateParam]
       );
       
       const { rows: channelWebsiteResult } = await sql.query(
         `SELECT 
           b.booking_number, b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}, b.channel
          FROM bookings b
          LEFT JOIN products p ON b.sku = p.sku
          LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
          WHERE b.tour_date >= $1 AND b.tour_date < $2 AND b.channel = 'Website'`,
         [startDateParam, endDateParam]
       );
      
             channelBasedViatorBenefit = channelViatorResult.reduce((sum, b) => {
        const netAdult = Number(b.net_adult) || 0;
        const netChild = Number(b.net_child) || 0;
        const adult = Number(b.adult) || 0;
        const child = Number(b.child) || 0;
        const paid = Number(b.paid) || 0;
        const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
        return sum + (paid - netTotal);
      }, 0);
      
             channelBasedWebsiteBenefit = channelWebsiteResult.reduce((sum, b) => {
        const netAdult = Number(b.net_adult) || 0;
        const netChild = Number(b.net_child) || 0;
        const adult = Number(b.adult) || 0;
        const child = Number(b.child) || 0;
        const paid = Number(b.paid) || 0;
        const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
        return sum + (paid - netTotal);
      }, 0);
    }

    // Calculate benefit by channel using the same logic as sales calculation
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

    // Extract Viator and Website metrics (moved here for comparison calculation)
         const viatorData = viatorWebsiteResult.find(row => row.type === 'Viator');
     const websiteData = viatorWebsiteResult.find(row => row.type === 'Website');
    
    const viatorSale = viatorData ? parseFloat(viatorData.sales) : 0;
    const websiteSale = websiteData ? parseFloat(websiteData.sales) : 0;

    // Determine if selected period is fully in the future (comparison disabled for future)
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    const isFuturePeriod = startDateParam && endDateParam
      ? new Date(startDateParam) >= todayStart
      : false;

    // NEW: Calculate comparison data for previous month period
    let comparisonData = null;
    if (dateFilter && startDateParam && endDateParam && !isFuturePeriod) {
      // Calculate the previous period dates
      const startDate = new Date(startDateParam);
      const endDate = new Date(endDateParam);
      const periodDuration = endDate.getTime() - startDate.getTime();
      
      // Calculate previous period start and end
      const prevEndDate = new Date(startDate.getTime());
      const prevStartDate = new Date(prevEndDate.getTime() - periodDuration);
      
      const prevStartDateParam = prevStartDate.toISOString().split('T')[0];
      const prevEndDateParam = prevEndDate.toISOString().split('T')[0];
      
      // Get previous period data for comparison
      let prevTotalSummaryResult;
      let prevViatorWebsiteResult;
      let prevTotalBenefitResult;
      let prevViatorBenefitResult;
      let prevWebsiteBenefitResult;
      
      const { rows: result } = await sql.query(`
         SELECT 
           COUNT(*) AS total_bookings,
           COALESCE(SUM(paid), 0) AS total_sales,
           COALESCE(SUM(adult), 0) AS total_adults,
           COALESCE(SUM(child), 0) AS total_children,
           COALESCE(SUM(infant), 0) AS total_infants
         FROM bookings
         WHERE tour_date >= $1 AND tour_date < $2
       `, [prevStartDateParam, prevEndDateParam]);
       prevTotalSummaryResult = result;
       
       const { rows: result2 } = await sql.query(`
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
       `, [prevStartDateParam, prevEndDateParam]);
       prevViatorWebsiteResult = result2;
       
       const { rows: result3 } = await sql.query(
         `SELECT 
           b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
          FROM bookings b
          LEFT JOIN products p ON b.sku = p.sku
          LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
          WHERE b.tour_date >= $1 AND b.tour_date < $2`,
         [prevStartDateParam, prevEndDateParam]
       );
       prevTotalBenefitResult = result3;
       
       const { rows: result4 } = await sql.query(
         `SELECT 
           b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}
          FROM bookings b
          LEFT JOIN products p ON b.sku = p.sku
          LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
          LEFT JOIN parsed_emails pe ON b.booking_number = pe.booking_number
          WHERE b.tour_date >= $1 AND b.tour_date < $2
          AND pe.sender ILIKE '%bokun.io%'
          AND b.booking_number NOT LIKE 'GYG%'`,
         [prevStartDateParam, prevEndDateParam]
       );
       prevViatorBenefitResult = result4;
       
       const { rows: result5 } = await sql.query(
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
         [prevStartDateParam, prevEndDateParam]
       );
       prevWebsiteBenefitResult = result5;
      
      // Calculate previous period values
             const prevTotalSale = parseFloat(prevTotalSummaryResult[0].total_sales);
       const prevViatorData = prevViatorWebsiteResult.find(row => row.type === 'Viator');
       const prevWebsiteData = prevViatorWebsiteResult.find(row => row.type === 'Website');
      const prevViatorSale = prevViatorData ? parseFloat(prevViatorData.sales) : 0;
      const prevWebsiteSale = prevWebsiteData ? parseFloat(prevWebsiteData.sales) : 0;
      
             const prevTotalBenefit = prevTotalBenefitResult.reduce((sum, b) => {
        const netAdult = Number(b.net_adult) || 0;
        const netChild = Number(b.net_child) || 0;
        const adult = Number(b.adult) || 0;
        const child = Number(b.child) || 0;
        const paid = Number(b.paid) || 0;
        const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
        return sum + (paid - netTotal);
      }, 0);
      
             const prevViatorBenefit = prevViatorBenefitResult.reduce((sum, b) => {
        const netAdult = Number(b.net_adult) || 0;
        const netChild = Number(b.net_child) || 0;
        const adult = Number(b.adult) || 0;
        const child = Number(b.child) || 0;
        const paid = Number(b.paid) || 0;
        const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
        return sum + (paid - netTotal);
      }, 0);
      
             const prevWebsiteBenefit = prevWebsiteBenefitResult.reduce((sum, b) => {
        const netAdult = Number(b.net_adult) || 0;
        const netChild = Number(b.net_child) || 0;
        const adult = Number(b.adult) || 0;
        const child = Number(b.child) || 0;
        const paid = Number(b.paid) || 0;
        const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
        return sum + (paid - netTotal);
      }, 0);
      
      // Calculate percentage changes
      const calculatePercentChange = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };

      // Top programs comparison: previous period vs current
      // Fetch previous period top programs (not limited by current top 10, but we'll merge and display current top 10 with deltas)
      let prevTopProgramsResult;
      const { rows: result6 } = await sql.query(`
         SELECT 
           program,
           COUNT(*) AS bookings,
           COALESCE(SUM(paid), 0) AS sales
         FROM bookings
         WHERE tour_date >= $1 AND tour_date < $2
           AND program IS NOT NULL AND program != ''
         GROUP BY program
         ORDER BY sales DESC
         LIMIT 50
       `, [prevStartDateParam, prevEndDateParam]);
       prevTopProgramsResult = result6;

      // Build map for quick lookup of previous metrics
             const prevMap = new Map(prevTopProgramsResult.map(r => [r.program, r]));

      // Merge with current top programs (limited to displayed set) and compute deltas
             topProgramsComparison = (topProgramsResult || []).map(r => {
        const prev = prevMap.get(r.program) || { bookings: 0, sales: 0 };
        const currentSales = parseFloat(r.sales) || 0;
        const previousSales = parseFloat(prev.sales) || 0;
        const salesPercentChange = calculatePercentChange(currentSales, previousSales);
        return {
          program: r.program,
          bookings: parseInt(r.bookings, 10) || 0,
          sales: currentSales,
          previousBookings: parseInt(prev.bookings, 10) || 0,
          previousSales,
          salesPercentChange
        };
      });
      
      comparisonData = {
        previousPeriod: {
          startDate: prevStartDateParam,
          endDate: prevEndDateParam
        },
                 totalSale: {
           current: totalSummaryResult[0].total_sales,
           previous: prevTotalSale,
           percentChange: calculatePercentChange(parseFloat(totalSummaryResult[0].total_sales), prevTotalSale)
         },
        viatorSale: {
          current: viatorSale,
          previous: prevViatorSale,
          percentChange: calculatePercentChange(viatorSale, prevViatorSale)
        },
        websiteSale: {
          current: websiteSale,
          previous: prevWebsiteSale,
          percentChange: calculatePercentChange(websiteSale, prevWebsiteSale)
        },
        totalBenefit: {
          current: totalBenefit,
          previous: prevTotalBenefit,
          percentChange: calculatePercentChange(totalBenefit, prevTotalBenefit)
        },
        viatorBenefit: {
          current: viatorBenefit,
          previous: prevViatorBenefit,
          percentChange: calculatePercentChange(viatorBenefit, prevViatorBenefit)
        },
        websiteBenefit: {
          current: websiteBenefit,
          previous: prevWebsiteBenefit,
          percentChange: calculatePercentChange(websiteBenefit, prevWebsiteBenefit)
        }
      };
    }

    // Find bookings that aren't captured by either Viator or Website categories
    let uncategorizedBenefitResult;
    if (dateFilter) {
             const { rows: result } = await sql.query(
         `SELECT 
           b.booking_number, b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}, pe.sender
          FROM bookings b
          LEFT JOIN products p ON b.sku = p.sku
          LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
          LEFT JOIN parsed_emails pe ON b.booking_number = pe.booking_number
          WHERE b.tour_date >= $1 AND b.tour_date < $2
          AND NOT (
            pe.sender ILIKE '%bokun.io%' OR
            b.booking_number LIKE 'GYG%' OR
            pe.sender ILIKE '%info@tours.co.th%'
          )`,
         [startDateParam, endDateParam]
       );
       uncategorizedBenefitResult = result;
     } else {
       const { rows: result } = await sql.query(
         `SELECT 
           b.booking_number, b.adult, b.child, b.paid, r.net_adult, r.net_child${hasNetTotalColumn ? ', b.net_total' : ''}, pe.sender
          FROM bookings b
          LEFT JOIN products p ON b.sku = p.sku
          LEFT JOIN rates r ON r.product_id = p.id AND LOWER(TRIM(r.name)) = LOWER(TRIM(b.rate))
          LEFT JOIN parsed_emails pe ON b.booking_number = pe.booking_number
          WHERE NOT (
            pe.sender ILIKE '%bokun.io%' OR
            b.booking_number LIKE 'GYG%' OR
            pe.sender ILIKE '%info@tours.co.th%'
          )`
       );
       uncategorizedBenefitResult = result;
    }
    
         const uncategorizedBenefit = uncategorizedBenefitResult.reduce((sum, b) => {
      const netAdult = Number(b.net_adult) || 0;
      const netChild = Number(b.net_child) || 0;
      const adult = Number(b.adult) || 0;
      const child = Number(b.child) || 0;
      const paid = Number(b.paid) || 0;
      const netTotal = hasNetTotalColumn && b.net_total !== null ? Number(b.net_total) : (netAdult * adult + netChild * child);
      return sum + (paid - netTotal);
    }, 0);

    // Extract Viator and Website metrics (already defined above)
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
    
    // Debug logging for passenger counts


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
       uncategorizedBenefit,
       uncategorizedBookings: uncategorizedBenefitResult,
       periodDays,
       // Debug information to investigate the difference
       debug: {
         availableChannels: debugChannels,
         nullChannelsCount: nullChannels[0].null_count,
         sampleBookings: sampleBookings,
         channelBasedViatorBenefit,
         channelBasedWebsiteBenefit,
         channelBasedTotal: channelBasedViatorBenefit + channelBasedWebsiteBenefit,
         difference: (viatorBenefit + websiteBenefit) - totalBenefit,
         channelDifference: (channelBasedViatorBenefit + channelBasedWebsiteBenefit) - totalBenefit
       },
       comparison: comparisonData,
       topProgramsComparison
     });
    
  } catch (err) {
    console.error('Sales analytics error:', err);
    res.status(500).json({ error: err.message });
  }
} 