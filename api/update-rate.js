const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const userRole = session.role;
  if (!["admin", "accounting", "reservation"].includes(userRole)) return res.status(403).json({ error: 'Forbidden: Admin, Accounting, or Reservation only' });

  if (req.method === 'GET') {
    // Debug mode - show booking and email info
    const { booking_number } = req.query;
    if (!booking_number) {
      return res.status(400).json({ error: 'Missing booking_number parameter' });
    }

    try {
      // Get booking info
      const { rows: bookingRows } = await sql`SELECT * FROM bookings WHERE booking_number = ${booking_number}`;
      if (!bookingRows.length) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      // Get email info
      const { rows: emailRows } = await sql`
        SELECT sender, subject, parsed_at 
        FROM parsed_emails 
        WHERE booking_number = ${booking_number}
        ORDER BY parsed_at DESC
        LIMIT 1
      `;

      return res.status(200).json({
        booking: {
          booking_number: bookingRows[0].booking_number,
          rate: bookingRows[0].rate,
          program: bookingRows[0].program,
          sku: bookingRows[0].sku,
          customer_name: bookingRows[0].customer_name
        },
        email: emailRows.length > 0 ? {
          sender: emailRows[0].sender,
          subject: emailRows[0].subject,
          parsed_at: emailRows[0].parsed_at
        } : null
      });
    } catch (err) {
      console.error('Debug error:', err);
      return res.status(500).json({ error: 'Failed to get debug info', details: err.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { booking_number, rate } = req.body;

  if (!booking_number || !rate) {
    return res.status(400).json({ error: 'Missing booking_number or rate' });
  }

  try {
    // Check if booking exists
    const { rows } = await sql`SELECT * FROM bookings WHERE booking_number = ${booking_number}`;
    if (!rows.length) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Update the rate
    await sql`UPDATE bookings SET rate = ${rate} WHERE booking_number = ${booking_number}`;
    
    console.log(`[UPDATE RATE] Updated booking ${booking_number} with rate: ${rate}`);
    
    return res.status(200).json({ 
      success: true, 
      message: `Rate updated for booking ${booking_number}`,
      rate: rate
    });
  } catch (err) {
    console.error('Failed to update rate:', err);
    return res.status(500).json({ error: 'Failed to update rate', details: err.message });
  }
}; 