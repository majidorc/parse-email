const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const userRole = session.role;
  if (userRole !== 'admin') return res.status(403).json({ error: 'Forbidden: Admins only' });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
}; 