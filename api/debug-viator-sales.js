import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    const { period } = req.query;
    
    console.log('Debug API called with period:', period);
    
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
    
    console.log('Date range:', lastMonthStartStr, 'to', thisMonthStartStr);
    
    const debugInfo = {
      period: `${lastMonthStartStr} to ${thisMonthStartStr}`,
      selectedPeriod: period || 'lastMonth',
      expected: 99100.02,
      actual: 77600.01,
      difference: 99100.02 - 77600.01,
      percentageDifference: ((99100.02 - 77600.01) / 99100.02 * 100).toFixed(2)
    };
    
    // Simple test query first
    console.log('Testing basic query...');
    const { rows: testResult } = await client.query(`
      SELECT COUNT(*) as total_bookings
      FROM bookings 
      WHERE tour_date >= $1 AND tour_date < $2
    `, [lastMonthStartStr, thisMonthStartStr]);
    
    debugInfo.totalBookings = parseInt(testResult[0].total_bookings);
    console.log('Total bookings:', debugInfo.totalBookings);
    
    // Test current analytics logic
    console.log('Testing current analytics logic...');
    const { rows: currentAnalyticsViator } = await client.query(`
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
      WHERE b.tour_date >= $1 AND b.tour_date < $2
      GROUP BY 
        CASE
          WHEN b.booking_number LIKE 'GYG%' THEN 'Website'
          WHEN p.sender ILIKE '%bokun.io%' THEN 'Viator'
          WHEN p.sender ILIKE '%info@tours.co.th%' THEN 'Website'
          ELSE 'Website'
        END
      ORDER BY calculated_channel
    `, [lastMonthStartStr, thisMonthStartStr]);
    
    debugInfo.currentAnalyticsBreakdown = currentAnalyticsViator;
    console.log('Analytics breakdown:', currentAnalyticsViator);
    
    // Check bokun emails
    console.log('Checking bokun emails...');
    const { rows: bokunEmails } = await client.query(`
      SELECT p.booking_number, p.sender, b.tour_date
      FROM parsed_emails p
      LEFT JOIN bookings b ON p.booking_number = b.booking_number
      WHERE b.tour_date >= $1 AND b.tour_date < $2
      AND p.sender ILIKE '%bokun.io%'
      ORDER BY b.tour_date
    `, [lastMonthStartStr, thisMonthStartStr]);
    
    debugInfo.bokunEmailsCount = bokunEmails.length;
    debugInfo.bokunEmails = bokunEmails.map(email => ({
      booking_number: email.booking_number,
      sender: email.sender,
      tour_date: email.tour_date
    }));
    
    console.log('Bokun emails found:', debugInfo.bokunEmailsCount);
    
    // Check info emails
    console.log('Checking info emails...');
    const { rows: infoEmails } = await client.query(`
      SELECT p.booking_number, p.sender, b.tour_date
      FROM parsed_emails p
      LEFT JOIN bookings b ON p.booking_number = b.booking_number
      WHERE b.tour_date >= $1 AND b.tour_date < $2
      AND p.sender ILIKE '%info@tours.co.th%'
      ORDER BY b.tour_date
    `, [lastMonthStartStr, thisMonthStartStr]);
    
    debugInfo.infoEmailsCount = infoEmails.length;
    debugInfo.infoEmails = infoEmails.map(email => ({
      booking_number: email.booking_number,
      sender: email.sender,
      tour_date: email.tour_date
    }));
    
    console.log('Info emails found:', debugInfo.infoEmailsCount);
    
    res.status(200).json(debugInfo);
    
  } catch (err) {
    console.error('Debug API Error:', err);
    res.status(500).json({ 
      error: err.message,
      stack: err.stack,
      period: req.query.period 
    });
  } finally {
    client.release();
  }
} 