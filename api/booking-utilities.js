const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

module.exports = async function handler(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const userRole = session.role;
  if (userRole !== 'admin') return res.status(403).json({ error: 'Forbidden: Admins only' });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action } = req.body;
    
    if (action === 'fix-booking-nets') {
      return await handleFixBookingNets(req, res);
    } else if (action === 'update-old-bookings-rates') {
      return await handleUpdateOldBookingsRates(req, res);
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "fix-booking-nets" or "update-old-bookings-rates"' });
    }
  } catch (err) {
    console.error('Booking utilities error:', err);
    res.status(500).json({ 
      error: 'Failed to process booking utilities request',
      details: err.message 
    });
  }
};

// Handle fixing booking net totals
async function handleFixBookingNets(req, res) {
  try {
    console.log('Starting to fix booking net totals...');
    
    // Step 1: Get all bookings that need fixing (net_total is NULL or 0)
    const { rows: bookingsToFix } = await sql.query(`
      SELECT DISTINCT b.booking_number, b.sku, b.adult, b.child, b.infant
      FROM bookings b
      WHERE b.net_total IS NULL OR b.net_total = 0
      AND b.sku IS NOT NULL
    `);
    
    console.log(`Found ${bookingsToFix.length} bookings to fix`);
    
    let fixedCount = 0;
    let errorCount = 0;
    
    // Step 2: Fix each booking
    for (const booking of bookingsToFix) {
      try {
        // Get the rate for this SKU
        const { rows: rateResult } = await sql.query(`
          SELECT r.net_adult, r.net_child, r.fee_adult, r.fee_child, r.fee_type
          FROM rates r
          JOIN products p ON r.product_id = p.id
          WHERE p.sku = $1
          LIMIT 1
        `, [booking.sku]);
        
        if (rateResult.length > 0) {
          const rate = rateResult[0];
          
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
          await sql.query(`
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
    const { rows: summaryResult } = await sql.query(`
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN net_total > 0 THEN 1 END) as bookings_with_net,
        COUNT(CASE WHEN net_total IS NULL OR net_total = 0 THEN 1 END) as bookings_without_net,
        COALESCE(SUM(net_total), 0) as total_net_amount
      FROM bookings
    `);
    
    const summary = summaryResult[0];
    
    console.log(`Fix completed! Fixed: ${fixedCount}, Errors: ${errorCount}`);
    
    res.status(200).json({
      success: true,
      action: 'fix-booking-nets',
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
  }
}

// Handle updating old bookings rates
async function handleUpdateOldBookingsRates(req, res) {
  try {
    // Find bookings that have SKU but no rate
    const { rows: oldBookings } = await sql`
      SELECT booking_number, sku, program 
      FROM bookings 
      WHERE sku IS NOT NULL AND sku != '' 
      AND (rate IS NULL OR rate = '')
      ORDER BY tour_date DESC
    `;

    let updated = 0;
    let skipped = 0;

    for (const booking of oldBookings) {
      try {
        // Find the best matching rate for this SKU
        const { rows: rates } = await sql`
          SELECT r.name, r.net_adult, r.net_child
          FROM rates r
          JOIN products p ON r.product_id = p.id
          WHERE p.sku = ${booking.sku}
          ORDER BY r.id ASC
          LIMIT 1
        `;

        if (rates.length > 0) {
          // Update the booking with the first available rate
          await sql`
            UPDATE bookings 
            SET rate = ${rates[0].name}
            WHERE booking_number = ${booking.booking_number}
          `;
          updated++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`Error updating booking ${booking.booking_number}:`, err);
        skipped++;
      }
    }

    return res.status(200).json({
      success: true,
      action: 'update-old-bookings-rates',
      updated,
      skipped,
      total: oldBookings.length
    });

  } catch (err) {
    console.error('Error updating old bookings rates:', err);
    return res.status(500).json({ 
      error: 'Failed to update old bookings rates', 
      details: err.message 
    });
  }
}
