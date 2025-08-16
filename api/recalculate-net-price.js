const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  if (session.role !== 'admin' && session.role !== 'accounting') {
    return res.status(403).json({ error: 'Forbidden: Admins or Accounting only' });
  }

  try {
    const { booking_number } = req.body;
    
    if (!booking_number) {
      return res.status(400).json({ error: 'Booking number is required' });
    }

    // Get the booking details with current rate and SKU
    const { rows: bookingRows } = await sql`
      SELECT b.booking_number, b.sku, b.rate, b.adult, b.child, b.infant
      FROM bookings b
      WHERE b.booking_number = ${booking_number}
    `;

    if (bookingRows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingRows[0];
    
    if (!booking.sku || !booking.rate) {
      return res.status(400).json({ 
        error: 'Cannot recalculate net price: SKU or rate is missing',
        details: { sku: booking.sku, rate: booking.rate }
      });
    }

    // Get the current rate information for the new rate
    const { rows: rateRows } = await sql`
      SELECT r.net_adult, r.net_child, r.fee_adult, r.fee_child, r.fee_type
      FROM rates r
      JOIN products p ON r.product_id = p.id
      WHERE p.sku = ${booking.sku} AND LOWER(TRIM(r.name)) = LOWER(TRIM(${booking.rate}))
      LIMIT 1
    `;

    if (rateRows.length === 0) {
      return res.status(400).json({ 
        error: 'Rate not found for the specified SKU and rate name',
        details: { sku: booking.sku, rate: booking.rate }
      });
    }

    const rate = rateRows[0];
    
    // Calculate new net_total based on passengers and new rates
    let netTotal = 0;
    
    if (booking.adult > 0) {
      netTotal += (Number(rate.net_adult) * Number(booking.adult));
      if (rate.fee_type === 'per_person' && rate.fee_adult) {
        netTotal += (Number(rate.fee_adult) * Number(booking.adult));
      }
    }
    
    if (booking.child > 0) {
      netTotal += (Number(rate.net_child) * Number(booking.child));
      if (rate.fee_type === 'per_person' && rate.fee_child) {
        netTotal += (Number(rate.fee_child) * Number(booking.child));
      }
    }
    
    if (rate.fee_type === 'total' && rate.fee_adult) {
      netTotal += Number(rate.fee_adult);
    }

    // Update the booking with the new net_total
    await sql`
      UPDATE bookings 
      SET net_total = ${netTotal}, 
          updated_fields = COALESCE(updated_fields, '{}'::jsonb) || '{"net_total_recalculated": true, "recalculated_at": ${new Date().toISOString()}}'::jsonb
      WHERE booking_number = ${booking_number}
    `;

    console.log(`Recalculated net price for booking ${booking_number}: ${netTotal} (SKU: ${booking.sku}, Rate: ${booking.rate})`);

    res.json({
      success: true,
      message: 'Net price recalculated successfully',
      data: {
        booking_number,
        old_net_total: booking.net_total || 0,
        new_net_total: netTotal,
        sku: booking.sku,
        rate: booking.rate,
        adult: booking.adult,
        child: booking.child,
        infant: booking.infant
      }
    });

  } catch (error) {
    console.error('Error recalculating net price:', error);
    res.status(500).json({ 
      error: 'Failed to recalculate net price',
      details: error.message 
    });
  }
};
