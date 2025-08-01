const { sql } = require('@vercel/postgres');

export default async function handler(req, res) {
  try {
    const { period } = req.query;
    
    // Calculate date range based on period
    let lastMonthStartStr, thisMonthStartStr;
    
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
          // Default to last month
          start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          end = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }
      
      lastMonthStartStr = start.toISOString().slice(0, 10);
      thisMonthStartStr = end.toISOString().slice(0, 10);
    } else {
      // Default to last month if no period specified
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      lastMonthStartStr = lastMonthStart.toISOString().slice(0, 10);
      thisMonthStartStr = thisMonthStart.toISOString().slice(0, 10);
    }
    
    const debugInfo = {
      period: `${lastMonthStartStr} to ${thisMonthStartStr}`,
      selectedPeriod: period || 'lastMonth',
      expected: 99100.02,
      actual: 77600.01,
      difference: 99100.02 - 77600.01,
      percentageDifference: ((99100.02 - 77600.01) / 99100.02 * 100).toFixed(2)
    };
    
    // 1. Check all bookings from last month
    const { rows: allLastMonthBookings } = await sql`
      SELECT booking_number, paid, tour_date, channel 
      FROM bookings 
      WHERE tour_date >= ${lastMonthStartStr} AND tour_date < ${thisMonthStartStr}
      ORDER BY tour_date
    `;
    
    debugInfo.totalBookings = allLastMonthBookings.length;
    debugInfo.totalSales = allLastMonthBookings.reduce((sum, b) => sum + parseFloat(b.paid || 0), 0).toFixed(2);
    
    // 2. Check OTA bookings (booking_number NOT LIKE '6%')
    const otaBookings = allLastMonthBookings.filter(b => !b.booking_number.startsWith('6'));
    const otaSales = otaBookings.reduce((sum, b) => sum + parseFloat(b.paid || 0), 0);
    
    debugInfo.otaBookings = otaBookings.length;
    debugInfo.otaSales = otaSales.toFixed(2);
    
    // 3. Check parsed emails for Viator identification
    const { rows: viatorEmails } = await sql`
      SELECT booking_number, sender, body 
      FROM parsed_emails 
      WHERE booking_number IN (
        SELECT booking_number FROM bookings 
        WHERE tour_date >= ${lastMonthStartStr} AND tour_date < ${thisMonthStartStr}
      )
    `;
    
    debugInfo.parsedEmails = viatorEmails.length;
    
    // 4. Identify Viator bookings based on email parsing logic
    const viatorBookings = viatorEmails.filter(email => {
      const sender = email.sender || '';
      const body = email.body || '';
      
      return (
        (sender.includes('bokun.io') && body.includes('Sold by') && body.includes('Viator.com')) ||
        (sender.includes('bokun.io') && !body.includes('GetYourGuide'))
      );
    });
    
    debugInfo.viatorBookingsByEmail = viatorBookings.length;
    
    // 5. Get actual Viator booking numbers and their sales
    const viatorBookingNumbers = viatorBookings.map(b => b.booking_number);
    const { rows: viatorSalesData } = await sql`
      SELECT booking_number, paid, tour_date, channel 
      FROM bookings 
      WHERE booking_number = ANY(${viatorBookingNumbers})
    `;
    
    const viatorSales = viatorSalesData.reduce((sum, b) => sum + parseFloat(b.paid || 0), 0);
    debugInfo.viatorSalesByEmail = viatorSales.toFixed(2);
    
    // 6. Check if there are any Viator bookings not in parsed_emails
    const { rows: allViatorBookings } = await sql`
      SELECT b.booking_number, b.paid, b.tour_date, b.channel, p.sender, p.body
      FROM bookings b
      LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
      WHERE b.tour_date >= ${lastMonthStartStr} AND b.tour_date < ${thisMonthStartStr}
      AND (
        b.channel = 'Viator' 
        OR p.sender ILIKE '%bokun.io%'
        OR b.booking_number LIKE 'V%'
      )
      ORDER BY b.tour_date
    `;
    
    debugInfo.allPotentialViatorBookings = allViatorBookings.length;
    const allViatorSales = allViatorBookings.reduce((sum, b) => sum + parseFloat(b.paid || 0), 0);
    debugInfo.allPotentialViatorSales = allViatorSales.toFixed(2);
    
    // 7. Check for any bookings with specific Viator patterns
    const { rows: viatorPatternBookings } = await sql`
      SELECT booking_number, paid, tour_date, channel
      FROM bookings 
      WHERE tour_date >= ${lastMonthStartStr} AND tour_date < ${thisMonthStartStr}
      AND (
        booking_number LIKE 'V%' 
        OR booking_number LIKE '%VIATOR%'
        OR channel = 'Viator'
      )
    `;
    
    debugInfo.viatorPatternBookings = viatorPatternBookings.length;
    const patternViatorSales = viatorPatternBookings.reduce((sum, b) => sum + parseFloat(b.paid || 0), 0);
    debugInfo.patternViatorSales = patternViatorSales.toFixed(2);
    
    // 8. Check what the analytics is actually calculating
    const { rows: analyticsOtaSales } = await sql`
      SELECT COALESCE(SUM(paid),0) AS ota_sale 
      FROM bookings 
      WHERE booking_number NOT LIKE '6%'
      AND tour_date >= ${lastMonthStartStr} AND tour_date < ${thisMonthStartStr}
    `;
    
    debugInfo.analyticsOtaSales = parseFloat(analyticsOtaSales[0].ota_sale).toFixed(2);
    
    // 9. Check if there are any missing bookings that should be Viator
    const { rows: allNonWebsiteBookings } = await sql`
      SELECT booking_number, paid, tour_date, channel, sender, body
      FROM bookings b
      LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
      WHERE tour_date >= ${lastMonthStartStr} AND tour_date < ${thisMonthStartStr}
      AND booking_number NOT LIKE '6%'
      ORDER BY tour_date
    `;
    
    debugInfo.allNonWebsiteBookings = allNonWebsiteBookings.length;
    const totalNonWebsiteSales = allNonWebsiteBookings.reduce((sum, b) => sum + parseFloat(b.paid || 0), 0);
    debugInfo.totalNonWebsiteSales = totalNonWebsiteSales.toFixed(2);
    
    // 10. Detailed breakdown of all non-website bookings
    debugInfo.nonWebsiteBookingsDetails = allNonWebsiteBookings.map(booking => ({
      booking_number: booking.booking_number,
      paid: booking.paid,
      tour_date: booking.tour_date,
      channel: booking.channel || 'N/A',
      sender: booking.sender || 'N/A'
    }));
    
    // 11. Check for any cancelled or deleted bookings that might affect the count
    const { rows: cancelledBookings } = await sql`
      SELECT booking_number, paid, tour_date, channel, cancelled, deleted
      FROM bookings 
      WHERE tour_date >= ${lastMonthStartStr} AND tour_date < ${thisMonthStartStr}
      AND (cancelled = true OR deleted = true)
    `;
    
    debugInfo.cancelledBookings = cancelledBookings.length;
    const cancelledSales = cancelledBookings.reduce((sum, b) => sum + parseFloat(b.paid || 0), 0);
    debugInfo.cancelledSales = cancelledSales.toFixed(2);
    
    // 15. NEW: Check if there are any bookings with specific patterns that might be Viator
    const { rows: potentialViatorBookings } = await sql`
      SELECT booking_number, paid, tour_date, channel, sender, body
      FROM bookings b
      LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
      WHERE tour_date >= ${lastMonthStartStr} AND tour_date < ${thisMonthStartStr}
      AND (
        b.booking_number LIKE '%VIATOR%'
        OR b.booking_number LIKE 'V%'
        OR b.booking_number LIKE '%BOKUN%'
        OR p.sender ILIKE '%bokun.io%'
        OR b.channel ILIKE '%viator%'
        OR b.channel ILIKE '%bokun%'
      )
      ORDER BY tour_date
    `;
    
    debugInfo.potentialViatorBookings = potentialViatorBookings.map(booking => ({
      booking_number: booking.booking_number,
      paid: booking.paid,
      tour_date: booking.tour_date,
      channel: booking.channel || 'N/A',
      sender: booking.sender || 'N/A'
    }));
    
    const potentialViatorSales = potentialViatorBookings.reduce((sum, b) => sum + parseFloat(b.paid || 0), 0);
    debugInfo.potentialViatorSales = potentialViatorSales.toFixed(2);
    
    // 16. NEW: Check what the current analytics logic would calculate for Viator
    const { rows: currentAnalyticsViator } = await sql`
      SELECT 
        CASE
          WHEN b.booking_number LIKE 'GYG%' THEN 'Website'
          WHEN p.sender ILIKE '%bokun.io%' THEN 'Viator'
          WHEN p.sender ILIKE '%info@tours.co.th%' THEN 'Website'
          ELSE 'Website'
        END AS calculated_channel,
        COUNT(*) AS count,
        COALESCE(SUM(b.paid), 0) AS total_sales
      FROM bookings b
      LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
      WHERE tour_date >= ${lastMonthStartStr} AND tour_date < ${thisMonthStartStr}
      GROUP BY 
        CASE
          WHEN b.booking_number LIKE 'GYG%' THEN 'Website'
          WHEN p.sender ILIKE '%bokun.io%' THEN 'Viator'
          WHEN p.sender ILIKE '%info@tours.co.th%' THEN 'Website'
          ELSE 'Website'
        END
      ORDER BY calculated_channel
    `;
    
    debugInfo.currentAnalyticsBreakdown = currentAnalyticsViator;
    
    // 17. NEW: Check all bokun emails for this period
    const { rows: bokunEmails } = await sql`
      SELECT booking_number, sender, body, tour_date
      FROM parsed_emails p
      LEFT JOIN bookings b ON p.booking_number = b.booking_number
      WHERE tour_date >= ${lastMonthStartStr} AND tour_date < ${thisMonthStartStr}
      AND p.sender ILIKE '%bokun.io%'
      ORDER BY tour_date
    `;
    
    debugInfo.bokunEmails = bokunEmails.map(email => ({
      booking_number: email.booking_number,
      sender: email.sender,
      tour_date: email.tour_date,
      body_preview: email.body ? email.body.substring(0, 100) + '...' : 'N/A'
    }));
    
    debugInfo.bokunEmailsCount = bokunEmails.length;
    
    // 18. NEW: Check all info@tours.co.th emails for this period
    const { rows: infoEmails } = await sql`
      SELECT booking_number, sender, body, tour_date
      FROM parsed_emails p
      LEFT JOIN bookings b ON p.booking_number = b.booking_number
      WHERE tour_date >= ${lastMonthStartStr} AND tour_date < ${thisMonthStartStr}
      AND p.sender ILIKE '%info@tours.co.th%'
      ORDER BY tour_date
    `;
    
    debugInfo.infoEmails = infoEmails.map(email => ({
      booking_number: email.booking_number,
      sender: email.sender,
      tour_date: email.tour_date,
      body_preview: email.body ? email.body.substring(0, 100) + '...' : 'N/A'
    }));
    
    debugInfo.infoEmailsCount = infoEmails.length;
    
    res.status(200).json(debugInfo);
    
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
} 