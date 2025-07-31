import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
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
    
    // Sales by channel with improved channel detection logic
    let salesByChannelResult;
    if (dateFilter) {
      salesByChannelResult = await sql`
        SELECT 
          CASE
            WHEN channel IS NOT NULL AND channel != '' THEN channel
            WHEN booking_number LIKE 'VTR%' THEN 'Viator.com'
            WHEN booking_number LIKE 'GYG%' THEN 'GetYourGuide'
            WHEN booking_number LIKE 'BKN%' THEN 'Bokun'
            WHEN booking_number LIKE '6%' THEN 'Website'
            WHEN booking_number LIKE 'TUR%' THEN 'Tours.co.th'
            ELSE 'Unknown'
          END AS channel,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS total_sales,
          COALESCE(SUM(adult), 0) AS total_adults,
          COALESCE(SUM(child), 0) AS total_children,
          COALESCE(SUM(infant), 0) AS total_infants
        FROM bookings
        WHERE tour_date >= ${startDateParam} AND tour_date < ${endDateParam}
        GROUP BY 
          CASE
            WHEN channel IS NOT NULL AND channel != '' THEN channel
            WHEN booking_number LIKE 'VTR%' THEN 'Viator.com'
            WHEN booking_number LIKE 'GYG%' THEN 'GetYourGuide'
            WHEN booking_number LIKE 'BKN%' THEN 'Bokun'
            WHEN booking_number LIKE '6%' THEN 'Website'
            WHEN booking_number LIKE 'TUR%' THEN 'Tours.co.th'
            ELSE 'Unknown'
          END
        ORDER BY total_sales DESC
      `;
    } else {
      salesByChannelResult = await sql`
        SELECT 
          CASE
            WHEN channel IS NOT NULL AND channel != '' THEN channel
            WHEN booking_number LIKE 'VTR%' THEN 'Viator.com'
            WHEN booking_number LIKE 'GYG%' THEN 'GetYourGuide'
            WHEN booking_number LIKE 'BKN%' THEN 'Bokun'
            WHEN booking_number LIKE '6%' THEN 'Website'
            WHEN booking_number LIKE 'TUR%' THEN 'Tours.co.th'
            ELSE 'Unknown'
          END AS channel,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS total_sales,
          COALESCE(SUM(adult), 0) AS total_adults,
          COALESCE(SUM(child), 0) AS total_children,
          COALESCE(SUM(infant), 0) AS total_infants
        FROM bookings
        GROUP BY 
          CASE
            WHEN channel IS NOT NULL AND channel != '' THEN channel
            WHEN booking_number LIKE 'VTR%' THEN 'Viator.com'
            WHEN booking_number LIKE 'GYG%' THEN 'GetYourGuide'
            WHEN booking_number LIKE 'BKN%' THEN 'Bokun'
            WHEN booking_number LIKE '6%' THEN 'Website'
            WHEN booking_number LIKE 'TUR%' THEN 'Tours.co.th'
            ELSE 'Unknown'
          END
        ORDER BY total_sales DESC
      `;
    }
    
    // Total summary for the period
    let totalSummaryResult;
    if (dateFilter) {
      totalSummaryResult = await sql`
        SELECT 
          COUNT(*) AS total_bookings,
          COALESCE(SUM(paid), 0) AS total_sales,
          COALESCE(SUM(adult), 0) AS total_adults,
          COALESCE(SUM(child), 0) AS total_children,
          COALESCE(SUM(infant), 0) AS total_infants
        FROM bookings
        WHERE tour_date >= ${startDateParam} AND tour_date < ${endDateParam}
      `;
    } else {
      totalSummaryResult = await sql`
        SELECT 
          COUNT(*) AS total_bookings,
          COALESCE(SUM(paid), 0) AS total_sales,
          COALESCE(SUM(adult), 0) AS total_adults,
          COALESCE(SUM(child), 0) AS total_children,
          COALESCE(SUM(infant), 0) AS total_infants
        FROM bookings
      `;
    }
    
    // Sales by month (for chart)
    let salesByMonthResult;
    if (dateFilter) {
      salesByMonthResult = await sql`
        SELECT 
          DATE_TRUNC('month', tour_date) AS month,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        WHERE tour_date >= ${startDateParam} AND tour_date < ${endDateParam}
        GROUP BY DATE_TRUNC('month', tour_date)
        ORDER BY month
      `;
    } else {
      salesByMonthResult = await sql`
        SELECT 
          DATE_TRUNC('month', tour_date) AS month,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        GROUP BY DATE_TRUNC('month', tour_date)
        ORDER BY month
      `;
    }
    
    // Top programs by sales
    let topProgramsResult;
    if (dateFilter) {
      topProgramsResult = await sql`
        SELECT 
          program,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        WHERE tour_date >= ${startDateParam} AND tour_date < ${endDateParam}
          AND program IS NOT NULL AND program != ''
        GROUP BY program
        ORDER BY sales DESC
        LIMIT 10
      `;
    } else {
      topProgramsResult = await sql`
        SELECT 
          program,
          COUNT(*) AS bookings,
          COALESCE(SUM(paid), 0) AS sales
        FROM bookings
        WHERE program IS NOT NULL AND program != ''
        GROUP BY program
        ORDER BY sales DESC
        LIMIT 10
      `;
    }
    
    res.status(200).json({
      salesByChannel: salesByChannelResult.rows,
      totalSummary: totalSummaryResult.rows[0],
      salesByMonth: salesByMonthResult.rows,
      topPrograms: topProgramsResult.rows
    });
    
  } catch (err) {
    console.error('Sales analytics error:', err);
    res.status(500).json({ error: err.message });
  }
} 