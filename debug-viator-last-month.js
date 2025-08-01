const { sql } = require('@vercel/postgres');

async function debugViatorLastMonth() {
  try {
    // Calculate last month date range
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStartStr = lastMonthStart.toISOString().slice(0, 10);
    const thisMonthStartStr = thisMonthStart.toISOString().slice(0, 10);
    
    console.log(`Analyzing Viator sales for: ${lastMonthStartStr} to ${thisMonthStartStr}`);
    
    // 1. Check all bookings from last month
    const { rows: allLastMonthBookings } = await sql`
      SELECT booking_number, paid, tour_date, channel 
      FROM bookings 
      WHERE tour_date >= ${lastMonthStartStr} AND tour_date < ${thisMonthStartStr}
      ORDER BY tour_date
    `;
    
    console.log(`\nTotal bookings last month: ${allLastMonthBookings.length}`);
    console.log(`Total sales last month: ${allLastMonthBookings.reduce((sum, b) => sum + parseFloat(b.paid || 0), 0).toFixed(2)}`);
    
    // 2. Check OTA bookings (booking_number NOT LIKE '6%')
    const otaBookings = allLastMonthBookings.filter(b => !b.booking_number.startsWith('6'));
    const otaSales = otaBookings.reduce((sum, b) => sum + parseFloat(b.paid || 0), 0);
    
    console.log(`\nOTA bookings (not starting with '6'): ${otaBookings.length}`);
    console.log(`OTA sales: ${otaSales.toFixed(2)}`);
    
    // 3. Check parsed emails for Viator identification
    const { rows: viatorEmails } = await sql`
      SELECT booking_number, sender, body 
      FROM parsed_emails 
      WHERE booking_number IN (
        SELECT booking_number FROM bookings 
        WHERE tour_date >= ${lastMonthStartStr} AND tour_date < ${thisMonthStartStr}
      )
    `;
    
    console.log(`\nParsed emails for last month: ${viatorEmails.length}`);
    
    // 4. Identify Viator bookings based on email parsing logic
    const viatorBookings = viatorEmails.filter(email => {
      const sender = email.sender || '';
      const body = email.body || '';
      
      return (
        (sender.includes('bokun.io') && body.includes('Sold by') && body.includes('Viator.com')) ||
        (sender.includes('bokun.io') && !body.includes('GetYourGuide'))
      );
    });
    
    console.log(`\nViator bookings identified by email parsing: ${viatorBookings.length}`);
    
    // 5. Get actual Viator booking numbers and their sales
    const viatorBookingNumbers = viatorBookings.map(b => b.booking_number);
    const { rows: viatorSalesData } = await sql`
      SELECT booking_number, paid, tour_date, channel 
      FROM bookings 
      WHERE booking_number = ANY(${viatorBookingNumbers})
    `;
    
    const viatorSales = viatorSalesData.reduce((sum, b) => sum + parseFloat(b.paid || 0), 0);
    console.log(`\nViator sales based on email parsing: ${viatorSales.toFixed(2)}`);
    
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
    
    console.log(`\nAll potential Viator bookings: ${allViatorBookings.length}`);
    const allViatorSales = allViatorBookings.reduce((sum, b) => sum + parseFloat(b.paid || 0), 0);
    console.log(`All potential Viator sales: ${allViatorSales.toFixed(2)}`);
    
    // 7. Show detailed breakdown
    console.log('\n=== DETAILED BREAKDOWN ===');
    allViatorBookings.forEach((booking, index) => {
      console.log(`${index + 1}. ${booking.booking_number} - ${booking.paid} - ${booking.tour_date} - Channel: ${booking.channel || 'N/A'}`);
    });
    
    // 8. Check for any bookings with specific Viator patterns
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
    
    console.log(`\nBookings with Viator patterns: ${viatorPatternBookings.length}`);
    const patternViatorSales = viatorPatternBookings.reduce((sum, b) => sum + parseFloat(b.paid || 0), 0);
    console.log(`Pattern Viator sales: ${patternViatorSales.toFixed(2)}`);
    
    // 9. Check what the analytics is actually calculating
    const { rows: analyticsOtaSales } = await sql`
      SELECT COALESCE(SUM(paid),0) AS ota_sale 
      FROM bookings 
      WHERE booking_number NOT LIKE '6%'
      AND tour_date >= ${lastMonthStartStr} AND tour_date < ${thisMonthStartStr}
    `;
    
    console.log(`\nAnalytics OTA sales calculation: ${parseFloat(analyticsOtaSales[0].ota_sale).toFixed(2)}`);
    
    // 10. Expected vs Actual comparison
    const expected = 99100.02;
    const actual = 77600.01;
    const difference = expected - actual;
    
    console.log('\n=== COMPARISON ===');
    console.log(`Expected Viator sales: ${expected.toFixed(2)}`);
    console.log(`Analytics showing: ${actual.toFixed(2)}`);
    console.log(`Difference: ${difference.toFixed(2)}`);
    console.log(`Percentage difference: ${((difference / expected) * 100).toFixed(2)}%`);
    
    // 11. Check if there are any missing bookings that should be Viator
    const { rows: allNonWebsiteBookings } = await sql`
      SELECT booking_number, paid, tour_date, channel, sender, body
      FROM bookings b
      LEFT JOIN parsed_emails p ON b.booking_number = p.booking_number
      WHERE tour_date >= ${lastMonthStartStr} AND tour_date < ${thisMonthStartStr}
      AND booking_number NOT LIKE '6%'
      ORDER BY tour_date
    `;
    
    console.log('\n=== ALL NON-WEBSITE BOOKINGS (should include Viator) ===');
    allNonWebsiteBookings.forEach((booking, index) => {
      console.log(`${index + 1}. ${booking.booking_number} - ${booking.paid} - ${booking.tour_date} - Channel: ${booking.channel || 'N/A'} - Sender: ${booking.sender || 'N/A'}`);
    });
    
    const totalNonWebsiteSales = allNonWebsiteBookings.reduce((sum, b) => sum + parseFloat(b.paid || 0), 0);
    console.log(`\nTotal non-website sales: ${totalNonWebsiteSales.toFixed(2)}`);
    
  } catch (err) {
    console.error('Error:', err);
  }
}

debugViatorLastMonth(); 