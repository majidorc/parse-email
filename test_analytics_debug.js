const { sql } = require('@vercel/postgres');

async function debugAnalytics() {
  try {
    console.log('=== ANALYTICS DEBUG REPORT ===\n');

    // 1. Check total bookings count
    const { rows: totalBookings } = await sql`SELECT COUNT(*) as total FROM bookings`;
    console.log(`1. Total bookings in database: ${totalBookings[0].total}`);

    // 2. Check for cancelled/deleted bookings
    const { rows: cancelledBookings } = await sql`
      SELECT COUNT(*) as count 
      FROM bookings 
      WHERE cancelled = true OR deleted = true
    `;
    console.log(`2. Cancelled/deleted bookings: ${cancelledBookings[0].count}`);

    // 3. Check this week's bookings (accounting vs analytics)
    const now = new Date();
    const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const thisWeekEnd = new Date(thisWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startStr = thisWeekStart.toISOString().slice(0, 10);
    const endStr = thisWeekEnd.toISOString().slice(0, 10);

    console.log(`\n3. This week period: ${startStr} to ${endStr}`);

    // This week bookings (accounting style - no filters)
    const { rows: thisWeekBookings } = await sql`
      SELECT COUNT(*) as count 
      FROM bookings 
      WHERE tour_date >= ${startStr} AND tour_date < ${endStr}
    `;
    console.log(`   This week bookings (accounting): ${thisWeekBookings[0].count}`);

    // This week bookings (analytics style - check for filters)
    const { rows: thisWeekAnalytics } = await sql`
      SELECT COUNT(*) as count 
      FROM bookings 
      WHERE tour_date >= ${startStr} AND tour_date < ${endStr}
      AND (cancelled IS NULL OR cancelled = false)
      AND (deleted IS NULL OR deleted = false)
    `;
    console.log(`   This week bookings (with cancelled/deleted filter): ${thisWeekAnalytics[0].count}`);

    // 4. Check channel distribution for this week
    const { rows: channelBreakdown } = await sql`
      SELECT 
        channel,
        COUNT(*) as count,
        COALESCE(SUM(paid), 0) as total_sales
      FROM bookings 
      WHERE tour_date >= ${startStr} AND tour_date < ${endStr}
      GROUP BY channel
      ORDER BY count DESC
    `;
    console.log('\n4. Channel breakdown for this week:');
    channelBreakdown.forEach(row => {
      console.log(`   ${row.channel || 'NULL'}: ${row.count} bookings, ${row.total_sales} sales`);
    });

    // 5. Check booking numbers pattern
    const { rows: bookingNumbers } = await sql`
      SELECT 
        booking_number,
        channel,
        tour_date,
        paid
      FROM bookings 
      WHERE tour_date >= ${startStr} AND tour_date < ${endStr}
      ORDER BY tour_date DESC
    `;
    console.log('\n5. This week bookings details:');
    bookingNumbers.forEach(row => {
      console.log(`   ${row.booking_number} | ${row.channel || 'NULL'} | ${row.tour_date} | ${row.paid}`);
    });

    // 6. Check if there are any cancelled bookings this week
    const { rows: cancelledThisWeek } = await sql`
      SELECT 
        booking_number,
        channel,
        tour_date,
        cancelled,
        deleted
      FROM bookings 
      WHERE tour_date >= ${startStr} AND tour_date < ${endStr}
      AND (cancelled = true OR deleted = true)
    `;
    console.log('\n6. Cancelled/deleted bookings this week:');
    if (cancelledThisWeek.length === 0) {
      console.log('   None found');
    } else {
      cancelledThisWeek.forEach(row => {
        console.log(`   ${row.booking_number} | ${row.channel || 'NULL'} | ${row.tour_date} | cancelled:${row.cancelled} | deleted:${row.deleted}`);
      });
    }

    // 7. Check database schema for cancelled/deleted columns
    const { rows: columns } = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'bookings' 
      AND column_name IN ('cancelled', 'deleted')
      ORDER BY column_name
    `;
    console.log('\n7. Database schema for cancelled/deleted columns:');
    if (columns.length === 0) {
      console.log('   No cancelled or deleted columns found');
    } else {
      columns.forEach(row => {
        console.log(`   ${row.column_name}: ${row.data_type}`);
      });
    }

    // 8. Test the exact queries used in analytics
    console.log('\n8. Testing exact analytics queries:');
    
    // Sales analytics query
    const { rows: salesAnalytics } = await sql`
      SELECT 
        CASE
          WHEN channel = 'Viator' THEN 'Viator'
          WHEN channel IN ('GYG', 'Website') THEN 'Website'
          ELSE 'Website'
        END AS channel,
        COUNT(*) AS bookings,
        COALESCE(SUM(paid), 0) AS total_sales
      FROM bookings
      WHERE tour_date >= ${startStr} AND tour_date < ${endStr}
      GROUP BY 
        CASE
          WHEN channel = 'Viator' THEN 'Viator'
          WHEN channel IN ('GYG', 'Website') THEN 'Website'
          ELSE 'Website'
        END
      ORDER BY total_sales DESC
    `;
    console.log('   Sales analytics channel breakdown:');
    salesAnalytics.forEach(row => {
      console.log(`     ${row.channel}: ${row.bookings} bookings, ${row.total_sales} sales`);
    });

    // Dashboard settings query
    const { rows: dashboardAnalytics } = await sql`
      SELECT COUNT(*) AS count 
      FROM bookings 
      WHERE tour_date >= ${startStr} AND tour_date < ${endStr}
    `;
    console.log(`   Dashboard analytics total bookings: ${dashboardAnalytics[0].count}`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugAnalytics().then(() => {
  console.log('\n=== DEBUG COMPLETE ===');
  process.exit(0);
}).catch(error => {
  console.error('Script error:', error);
  process.exit(1);
}); 