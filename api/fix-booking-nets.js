const { Pool } = require('pg');

// For Vercel serverless functions, we need to create a new connection each time
const createPool = () => {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  let pool;
  
  try {
    pool = createPool();
    client = await pool.connect();
    
    console.log('Starting to fix booking net totals...');
    
    // Step 1: Get all bookings that need fixing (net_total is NULL or 0)
    const bookingsToFix = await client.query(`
      SELECT DISTINCT b.booking_number, b.sku, b.adult, b.child, b.infant
      FROM bookings b
      WHERE b.net_total IS NULL OR b.net_total = 0
      AND b.sku IS NOT NULL
    `);
    
    console.log(`Found ${bookingsToFix.rows.length} bookings to fix`);
    
    let fixedCount = 0;
    let errorCount = 0;
    
    // Step 2: Fix each booking
    for (const booking of bookingsToFix.rows) {
      try {
        // Get the rate for this SKU
        const rateResult = await client.query(`
          SELECT r.net_adult, r.net_child, r.fee_adult, r.fee_child, r.fee_type
          FROM rates r
          JOIN products p ON r.product_id = p.id
          WHERE p.sku = $1
          LIMIT 1
        `, [booking.sku]);
        
        if (rateResult.rows.length > 0) {
          const rate = rateResult.rows[0];
          
          // Calculate net_total based on passengers and rates
          let netTotal = 0;
          
          if (booking.adult > 0) {
            netTotal += (rate.net_adult * booking.adult);
            if (rate.fee_type === 'per_person' && rate.fee_adult) {
              netTotal += (rate.fee_adult * booking.adult);
            }
          }
          
          if (booking.child > 0) {
            netTotal += (rate.net_child * booking.child);
            if (rate.fee_type === 'per_person' && rate.fee_child) {
              netTotal += (rate.fee_child * booking.child);
            }
          }
          
          if (rate.fee_type === 'total' && rate.fee_adult) {
            netTotal += rate.fee_adult;
          }
          
          // Update the booking with calculated net_total
          await client.query(`
            UPDATE bookings 
            SET net_total = $1, updated_fields = COALESCE(updated_fields, '{}'::jsonb) || '{"net_total_fixed": true}'::jsonb
            WHERE booking_number = $2
          `, [netTotal, booking.booking_number]);
          
          fixedCount++;
          console.log(`Fixed booking ${booking.booking_number}: SKU ${booking.sku}, net_total = ${netTotal}`);
        } else {
          console.log(`No rate found for SKU ${booking.sku} in booking ${booking.booking_number}`);
          errorCount++;
        }
      } catch (error) {
        console.error(`Error fixing booking ${booking.booking_number}:`, error);
        errorCount++;
      }
    }
    
    // Step 3: Get summary of what was fixed
    const summaryResult = await client.query(`
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN net_total > 0 THEN 1 END) as bookings_with_net,
        COUNT(CASE WHEN net_total IS NULL OR net_total = 0 THEN 1 END) as bookings_without_net,
        COALESCE(SUM(net_total), 0) as total_net_amount
      FROM bookings
    `);
    
    const summary = summaryResult.rows[0];
    
    console.log(`Fix completed! Fixed: ${fixedCount}, Errors: ${errorCount}`);
    
    res.status(200).json({
      success: true,
      message: `Fixed ${fixedCount} bookings`,
      summary: {
        total_bookings: summary.total_bookings,
        bookings_with_net: summary.bookings_with_net,
        bookings_without_net: summary.bookings_without_net,
        total_net_amount: summary.total_net_amount,
        fixed_count: fixedCount,
        error_count: errorCount
      }
    });
    
  } catch (err) {
    console.error('Error fixing booking nets:', err);
    res.status(500).json({ 
      error: 'Failed to fix booking nets',
      details: err.message 
    });
  } finally {
    if (client) {
      client.release();
    }
    if (pool) {
      await pool.end();
    }
  }
};
