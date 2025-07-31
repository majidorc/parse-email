const { Pool } = require('pg');

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});

async function checkBookingPatterns() {
  const client = await pool.connect();
  try {
    console.log('=== CHECKING BOOKING PATTERNS ===');
    
    // Check all booking numbers
    const bookingNumbers = await client.query(`
      SELECT booking_number, channel, paid, tour_date 
      FROM bookings 
      ORDER BY tour_date DESC 
      LIMIT 20
    `);
    
    console.log('\n--- Recent Booking Numbers ---');
    bookingNumbers.rows.forEach(row => {
      console.log(`Booking: ${row.booking_number}, Channel: ${row.channel || 'NULL'}, Paid: ${row.paid}, Date: ${row.tour_date}`);
    });
    
    // Check channel distribution
    const channelStats = await client.query(`
      SELECT channel, COUNT(*) as count, SUM(paid) as total_sales
      FROM bookings 
      WHERE channel IS NOT NULL AND channel != ''
      GROUP BY channel
      ORDER BY total_sales DESC
    `);
    
    console.log('\n--- Channel Distribution ---');
    channelStats.rows.forEach(row => {
      console.log(`Channel: ${row.channel}, Count: ${row.count}, Sales: ${row.total_sales}`);
    });
    
    // Check booking number patterns
    const patterns = await client.query(`
      SELECT 
        CASE 
          WHEN booking_number LIKE 'VTR%' THEN 'VTR pattern'
          WHEN booking_number LIKE 'GYG%' THEN 'GYG pattern'
          WHEN booking_number LIKE '6%' THEN '6 pattern'
          WHEN booking_number LIKE 'TUR%' THEN 'TUR pattern'
          ELSE 'Other pattern'
        END as pattern,
        COUNT(*) as count,
        SUM(paid) as total_sales
      FROM bookings
      GROUP BY 
        CASE 
          WHEN booking_number LIKE 'VTR%' THEN 'VTR pattern'
          WHEN booking_number LIKE 'GYG%' THEN 'GYG pattern'
          WHEN booking_number LIKE '6%' THEN '6 pattern'
          WHEN booking_number LIKE 'TUR%' THEN 'TUR pattern'
          ELSE 'Other pattern'
        END
      ORDER BY total_sales DESC
    `);
    
    console.log('\n--- Booking Number Patterns ---');
    patterns.rows.forEach(row => {
      console.log(`Pattern: ${row.pattern}, Count: ${row.count}, Sales: ${row.total_sales}`);
    });
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

checkBookingPatterns(); 